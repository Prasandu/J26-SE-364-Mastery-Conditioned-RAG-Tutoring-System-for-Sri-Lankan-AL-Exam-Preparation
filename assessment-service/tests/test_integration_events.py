"""DAT-010 producer: GET /integration/events (assessment.criterion.finalized v1).

Only finalized official decisions (rule, checker, teacher - never a generative model)
on marked attempts of shared papers, for accounts linked to a Supabase user; stable
event ids; a teacher correction is a new source_version of the same point (R11/R12);
the route needs a component's X-Integration-Key (R14). Throwaway SQLite, offline.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.models import (
    Answer,
    AnswerMode,
    Attempt,
    AttemptMode,
    AttemptStatus,
    ContentStatus,
    MarkingMethod,
    MarkingPoint,
    MarkingScheme,
    Paper,
    PaperKind,
    PointResult,
    PointReview,
    PointStatus,
    PointType,
    Question,
    SchemeSource,
    Section,
    Topic,
    User,
    UserRole,
)
from app.services.integration import finalized_events

LINKED = "6f1c0d2e-8b3a-4c5d-9e7f-0a1b2c3d4e5f"
NOW = datetime.now(UTC)


PG_URL = os.environ.get("ASSESSMENT_TEST_PG_URL")  # a disposable Postgres; never a shared one


@pytest.fixture(params=["sqlite", "postgres"])
def db(request):
    if request.param == "sqlite":
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    elif PG_URL:
        engine = create_engine(PG_URL)
        with engine.begin() as connection:
            connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
        Base.metadata.drop_all(engine)
    else:
        pytest.skip("ASSESSMENT_TEST_PG_URL not set (disposable Postgres for the keyset query)")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    if request.param == "postgres":
        Base.metadata.drop_all(engine)
    engine.dispose()


def seed(db: Session) -> dict:
    student = User(
        email="linked@school.lk", name="L", password_hash="", role=UserRole.STUDENT, supabase_user_id=LINKED
    )
    unlinked = User(email="local@school.lk", name="U", password_hash="h", role=UserRole.STUDENT)
    topic = Topic(code="U03_5", name="Mole concept")
    shared = Paper(title="2024 past", kind=PaperKind.PAST, status=ContentStatus.PUBLISHED)
    practice = Paper(
        title="practice", kind=PaperKind.MODEL, status=ContentStatus.PUBLISHED, created_by="linked@school.lk"
    )
    db.add_all([student, unlinked, topic, shared, practice])
    db.flush()

    def question(paper: Paper) -> Question:
        section = Section(paper_id=paper.id, code="A", title="A", answer_mode=next(iter(AnswerMode)))
        db.add(section)
        db.flush()
        q = Question(section_id=section.id, label="1")
        q.topics.append(topic)
        db.add(q)
        db.flush()
        return q

    def attempt(owner: User, paper: Paper, q: Question, methods: dict, scheme_id: int) -> Attempt:
        # Postgres enforces the scheme foreign key that SQLite does not.
        scheme = MarkingScheme(
            id=scheme_id, paper_id=paper.id, version=scheme_id, source=SchemeSource.OFFICIAL
        )
        db.add(scheme)
        db.flush()
        a = Attempt(
            id=uuid.uuid4(),
            paper_id=paper.id,
            scheme_id=scheme_id,
            student_ref=owner.email,
            mode=AttemptMode.DIGITAL,
            status=AttemptStatus.MARKED,
            max_score=10,
            marked_at=NOW - timedelta(hours=1),
        )
        answer = Answer(attempt=a, question_id=q.id, text="x")
        db.add_all([a, answer])
        for code, (method, status) in methods.items():
            p = MarkingPoint(
                scheme_id=scheme_id,
                question_id=q.id,
                code=code,
                description="d",
                marks=2,
                point_type=PointType.CONCEPT,
            )
            db.add(p)
            r = PointResult(
                answer=answer,
                point=p,
                status=status,
                awarded=2 if status == PointStatus.AWARDED else 0,
                method=method,
            )
            if method == MarkingMethod.TEACHER:
                r.reviews.append(PointReview(awarded=True, teacher_ref="teacher@school.lk"))
                r.reviewed_at = NOW - timedelta(minutes=30)
            db.add(r)
        return a

    q_shared, q_practice = question(shared), question(practice)
    methods = {
        "RULE": (MarkingMethod.RULE, PointStatus.AWARDED),
        "CHECK": (MarkingMethod.CHECKER, PointStatus.NOT_AWARDED),
        "TEACH": (MarkingMethod.TEACHER, PointStatus.AWARDED),
        "LLM": (MarkingMethod.LLM, PointStatus.AWARDED),  # pre-GRD-011 AI decision
        "REVIEW": (MarkingMethod.LLM, PointStatus.NEEDS_REVIEW),
    }
    main = attempt(student, shared, q_shared, methods, scheme_id=1)
    attempt(unlinked, shared, q_shared, {"RULE": (MarkingMethod.RULE, PointStatus.AWARDED)}, scheme_id=2)
    attempt(student, practice, q_practice, {"RULE": (MarkingMethod.RULE, PointStatus.AWARDED)}, scheme_id=3)
    db.commit()
    return {"attempt": main}


def test_only_trusted_finalized_points_of_linked_students_on_shared_papers(db):
    attempt = seed(db)["attempt"]

    events = finalized_events(db, since=NOW - timedelta(days=1)).events

    assert sorted(e.source_entity_id.rsplit("/", 1)[1] for e in events) == ["CHECK", "RULE", "TEACH"]
    assert {e.subject_user_id for e in events} == {LINKED}
    assert all(e.source_entity_id.startswith(f"attempt/{attempt.id}/") for e in events)
    by_code = {e.source_entity_id.rsplit("/", 1)[1]: e for e in events}
    assert by_code["RULE"].evidence_class == "deterministic"
    assert by_code["TEACH"].evidence_class == "teacher_verified"
    assert by_code["CHECK"].score.awarded == 0 and by_code["CHECK"].score.maximum == 2
    assert by_code["RULE"].source_topic_codes == ["U03_5"]


def test_event_ids_are_stable_across_reads(db):
    seed(db)

    first = finalized_events(db, since=NOW - timedelta(days=1)).events
    second = finalized_events(db, since=NOW - timedelta(days=1)).events

    assert [e.event_id for e in first] == [e.event_id for e in second]
    assert len({e.event_id for e in first}) == len(first)


def test_a_teacher_correction_is_a_new_version_of_the_same_point(db):
    seed(db)
    before = {e.source_entity_id: e for e in finalized_events(db, since=NOW - timedelta(days=1)).events}
    teach = next(r for r in db.query(PointResult).all() if r.point.code == "TEACH")

    teach.reviews.append(PointReview(awarded=False, teacher_ref="teacher2@school.lk"))
    teach.status, teach.awarded, teach.reviewed_at = PointStatus.NOT_AWARDED, 0, NOW
    db.commit()
    after = {e.source_entity_id: e for e in finalized_events(db, since=NOW - timedelta(days=1)).events}

    entity = next(k for k in after if k.endswith("/TEACH"))
    assert after[entity].source_version == before[entity].source_version + 1
    assert after[entity].event_id != before[entity].event_id
    assert after[entity].score.awarded == 0


def test_since_excludes_older_decisions(db):
    seed(db)

    assert finalized_events(db, since=NOW + timedelta(minutes=1)).events == []


def test_keyset_pages_cover_every_decision_exactly_once(db):
    seed(db)
    everything = finalized_events(db, since=NOW - timedelta(days=1))

    seen, cursor, pages = [], None, 0
    while True:
        page = finalized_events(db, since=NOW - timedelta(days=1), limit=1, after=cursor)
        seen += [e.event_id for e in page.events]
        cursor, pages = page.next_cursor, pages + 1
        if not page.has_more:
            break

    assert seen == [e.event_id for e in everything.events]
    assert pages == len(everything.events) and not everything.has_more
    # Oldest final decision first: the teacher review (30 min ago) after the marking (1 h ago).
    assert everything.events[-1].source_entity_id.endswith("/TEACH")
    assert all(e.assessed_at <= e.occurred_at for e in everything.events)
    # A cursor past the end returns nothing and keeps the position.
    tail = finalized_events(db, since=NOW - timedelta(days=1), after=cursor)
    assert tail.events == [] and tail.next_cursor == cursor and not tail.has_more


def test_the_legacy_ai_report_lists_pre_grd011_ai_marks_and_changes_nothing(db):
    from app.services.legacy_ai_marks import legacy_ai_attempts, pseudonym

    attempt = seed(db)["attempt"]
    before = [(r.id, r.status, r.awarded, r.method) for r in db.query(PointResult).order_by(PointResult.id)]

    [row] = legacy_ai_attempts(db)

    assert row.attempt_id == str(attempt.id)
    # The AWARDED LLM point only; the LLM point awaiting review holds no marks.
    assert (row.ai_points, row.ai_awarded_marks, row.ai_not_awarded_points) == (1, 2, 0)
    assert row.student == pseudonym("linked@school.lk") and "@" not in row.student
    assert not (db.new or db.dirty or db.deleted)
    after = [(r.id, r.status, r.awarded, r.method) for r in db.query(PointResult).order_by(PointResult.id)]
    assert after == before


def test_the_event_matches_the_shared_v1_contract():
    import json
    from pathlib import Path

    from app.schemas.integration import FinalizedEventOut
    from app.services.integration import EVENT_NAMESPACE

    contract = json.loads(
        (
            Path(__file__).resolve().parents[2] / "shared/contracts/assessment-criterion-finalized.v1.json"
        ).read_text(encoding="utf-8")
    )
    assert set(contract["required"]) == set(FinalizedEventOut.model_fields)
    assert set(contract["properties"]) == set(FinalizedEventOut.model_fields)
    assert contract["x-eventIdNamespace"] == str(EVENT_NAMESPACE)


def test_a_tampered_cursor_is_refused(db):
    from app.errors import ContentValidationError

    seed(db)
    for bad in ("not-base64!", "eyJ0IjoxfQ", "e30"):
        with pytest.raises(ContentValidationError):
            finalized_events(db, since=None, after=bad)


def test_the_route_requires_a_component_integration_key():
    for module in ("openai", "google.genai", "cv2", "rdkit"):
        pytest.importorskip(module)
    from fastapi.testclient import TestClient

    from app.config import Settings, get_settings
    from app.main import app

    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, database_url="sqlite://", integration_key_component3="k" * 20
    )
    try:
        client = TestClient(app)
        assert client.get("/integration/events").status_code == 401
        assert (
            client.get("/integration/events", headers={"X-Integration-Key": "wrong" * 4}).status_code == 401
        )
        assert (
            client.get(
                "/integration/events", headers={"Authorization": "Bearer a-students-token"}
            ).status_code
            == 401
        )
    finally:
        app.dependency_overrides.clear()
