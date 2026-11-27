"""PL-008 / PL-009 end to end on the disposable PostgreSQL (PLANNING_TEST_PG_URL):
a manual plan from self-reported coverage, with no marks, creates no mastery; each task
says what drove it; finalized marks later take over the activity choice while the
coverage stays visible as its own signal."""

import json
import uuid
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.errors import ConstraintViolation
from app.models import LearnerTopicState, StudyPlan, StudyTask, TopicEvidence
from app.schemas.finalized_marks import event_id_for
from app.schemas.plans import PlanInput
from app.services.finalized_marks import ingest_finalized_events
from app.services.plans import create_plan
from app.services.scheduling import generate_and_commit_schedule
from app.services.topic_registry import TopicRegistry, canonical_topic_ids

STUDENT = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a"
MOLE, GASES, STOICH = "chem-u3-mole-concept", "chem-u4-ideal-gas-equation", "chem-u3-stoichiometry"
NOW = datetime.now(UTC).replace(microsecond=0)


def manual(topics, coverage):
    return PlanInput(
        mode="manual",
        exam_date=date.today() + timedelta(days=120),
        target_grade="B",
        topics=topics,
        coverage=coverage,
        availability_windows=[
            {"weekday": day, "start_time": time(15, 0), "end_time": time(20, 0)} for day in range(7)
        ],
        max_session_minutes=60,
        max_daily_minutes=300,
    )


def build(session, topics, coverage):
    response = create_plan(session, STUDENT, manual(topics, coverage))
    plan = session.get(StudyPlan, uuid.UUID(response["id"]))
    generate_and_commit_schedule(session, STUDENT, plan.id, now=NOW)
    tasks = session.scalars(select(StudyTask).where(StudyTask.plan_id == plan.id)).all()
    return plan, {task.topic_id: task for task in tasks}


def test_a_coverage_plan_without_marks_creates_no_mastery_and_explains_itself(pg_session):
    plan, tasks = build(
        pg_session,
        [MOLE, GASES, STOICH],
        [
            {"topic_id": MOLE, "covered_percent": 100},
            {"topic_id": GASES, "covered_percent": 0},
        ],
    )

    stored = {entry["topic_id"]: entry for entry in plan.constraints["coverage"]}
    assert stored[MOLE]["source"] == "self_reported" and stored[MOLE]["updated_at"]
    priorities = {item["topic_id"]: item["priority"] for item in plan.constraints["priorities"]}
    assert priorities[GASES] > priorities[MOLE]  # uncovered content first
    for model in (TopicEvidence, LearnerTopicState):
        count = select(func.count()).select_from(model).where(model.student_id == STUDENT)
        assert pg_session.scalar(count) == 0  # no fabricated mastery
    assert {MOLE, GASES, STOICH} <= tasks.keys()
    mole, gases, stoich = (tasks[t].reason_details for t in (MOLE, GASES, STOICH))
    assert mole["evidence_source"] == "self_reported_coverage" and mole["self_reported_coverage"] == 100
    assert tasks[MOLE].activity == "guided_practice" and tasks[GASES].activity == "theory"
    assert gases["self_reported_coverage"] == 0 and mole["has_evidence"] is False
    assert stoich["evidence_source"] == "student_choice" and stoich["self_reported_coverage"] is None


def test_a_parent_and_its_sub_topic_reported_in_contradiction_are_refused(pg_session):
    parent, child = MOLE, "chem-u3-amount-of-substance"

    with pytest.raises(ConstraintViolation, match="Inconsistent syllabus coverage"):
        create_plan(
            pg_session,
            STUDENT,
            manual(
                [parent, child],
                [{"topic_id": parent, "covered_percent": 100}, {"topic_id": child, "covered_percent": 20}],
            ),
        )


def test_marks_take_over_while_coverage_stays_a_separate_signal(pg_session):
    plan, _ = build(pg_session, [MOLE, GASES], [{"topic_id": MOLE, "covered_percent": 40}])
    topics = json.loads(
        (Path(__file__).resolve().parents[2] / "shared/contracts/topics.json").read_text("utf-8")
    )
    registry = TopicRegistry(
        {
            "sources": ["assessment"],
            "aliases": [
                {
                    "source": "assessment",
                    "code": "U03_5",
                    "topicId": MOLE,
                    "status": "approved",
                    "reviewedBy": "test reviewer",
                    "reviewedAt": "2026-11-27",
                }
            ],
        },
        canonical_topic_ids(topics),
    )
    entity = "attempt/0ad4ab23-0a22-4546-8027-1293a67fb020/point/P1"
    ingest_finalized_events(
        pg_session,
        [
            {
                "schema_version": "1.0.0",
                "event_id": event_id_for(entity, 0),
                "event_type": "assessment.criterion.finalized",
                "producer": "assessment-service",
                "subject_user_id": STUDENT,
                "source_entity_id": entity,
                "source_version": 0,
                "source_topic_codes": ["U03_5"],
                "status": "final",
                "evidence_class": "deterministic",
                "score": {"awarded": 3, "maximum": 3},
                "paper_id": 1,
                "assessed_at": (NOW - timedelta(days=1)).isoformat(),
                "occurred_at": (NOW - timedelta(days=1)).isoformat(),
            }
        ],
        registry,
        now=NOW,
    )
    pg_session.commit()

    generate_and_commit_schedule(pg_session, STUDENT, plan.id, now=NOW)
    tasks = pg_session.scalars(select(StudyTask).where(StudyTask.plan_id == plan.id)).all()
    mole = next(task for task in tasks if task.topic_id == MOLE).reason_details

    assert mole["evidence_source"] == "results" and mole["has_evidence"] is True
    assert mole["self_reported_coverage"] == 40
    assert plan.constraints["priorities"][0]["reason"].startswith("Self-reported coverage 40%")
