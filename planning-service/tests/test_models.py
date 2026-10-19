from app import models
from app.db import Base


def test_all_p1_models_use_planning_schema() -> None:
    expected_tables = {
        "availability_slots",
        "attempts",
        "learner_topic_state",
        "notification_preferences",
        "notifications",
        "papers",
        "predictions",
        "profile_embeddings",
        "questions",
        "raw_events",
        "replan_log",
        "roadmap_weeks",
        "study_plans",
        "study_tasks",
        "topic_evidence",
        "topics",
    }

    assert set(Base.metadata.tables) == {f"planning.{table}" for table in expected_tables}
    assert models.ProfileEmbedding.__table__.c.embedding.type.dim == 16
    assert "grade_level" in models.Topic.__table__.c
    assert "description" in models.Topic.__table__.c


def test_topic_evidence_is_idempotent_per_event_topic_and_question() -> None:
    evidence = models.TopicEvidence.__table__

    assert any(
        constraint.name == "uq_topic_evidence_event_topic_question"
        for constraint in evidence.constraints
    )
    assert "uq_topic_evidence_event_topic_unlinked" in {
        index.name for index in evidence.indexes
    }
    assert "question_id" in evidence.c


def test_task_outcome_columns_and_constraints_are_defined() -> None:
    tasks = models.StudyTask.__table__

    assert {"actual_duration_min", "score_before", "score_after"}.issubset(tasks.c.keys())
    assert {
        "ck_study_tasks_actual_duration",
        "ck_study_tasks_score_range",
    }.issubset({constraint.name for constraint in tasks.constraints})
