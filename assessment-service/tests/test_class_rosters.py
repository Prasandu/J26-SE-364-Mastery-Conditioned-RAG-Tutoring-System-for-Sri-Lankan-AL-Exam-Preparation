"""Class rosters (operator decision 2026-11-27): a teacher reviews only students in a class
they teach; an admin sees everyone; out-of-scope ids answer 404; the decision is recorded
under the signed-in account. Throwaway SQLite (and Postgres when ASSESSMENT_TEST_PG_URL)."""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.errors import ContentValidationError, NotFoundError
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
    PointStatus,
    PointType,
    Question,
    SchemeSource,
    Section,
    User,
    UserRole,
)
from app.schemas.review import ReviewDecisionIn
from app.services import classes, review

PG_URL = os.environ.get("ASSESSMENT_TEST_PG_URL")


@pytest.fixture(params=["sqlite", "postgres"])
def engine(request):
    if request.param == "sqlite":
        eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    elif PG_URL:
        eng = create_engine(PG_URL)
        with eng.begin() as connection:
            connection.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
        Base.metadata.drop_all(eng)
    else:
        pytest.skip("ASSESSMENT_TEST_PG_URL not set")
    Base.metadata.create_all(eng)
    yield eng
    if request.param == "postgres":
        Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    with Session(engine, expire_on_commit=False) as session:
        yield session


def seed(db: Session) -> dict:
    people = {
        "teacher_a": User(email="ta@school.lk", name="TA", password_hash="h", role=UserRole.TEACHER),
        "teacher_b": User(email="tb@school.lk", name="TB", password_hash="h", role=UserRole.TEACHER),
        "admin": User(email="ad@school.lk", name="AD", password_hash="h", role=UserRole.ADMIN),
        "s1": User(email="s1@school.lk", name="S1", password_hash="h", role=UserRole.STUDENT),
        "s2": User(email="s2@school.lk", name="S2", password_hash="h", role=UserRole.STUDENT),
    }
    paper = Paper(title="2024 past", kind=PaperKind.PAST, status=ContentStatus.PUBLISHED)
    db.add_all([*people.values(), paper])
    db.flush()
    scheme = MarkingScheme(paper_id=paper.id, version=1, source=SchemeSource.OFFICIAL)
    section = Section(paper_id=paper.id, code="A", title="A", answer_mode=next(iter(AnswerMode)))
    db.add_all([scheme, section])
    db.flush()
    question = Question(section_id=section.id, label="1")
    db.add(question)
    db.flush()
    point = MarkingPoint(
        scheme_id=scheme.id,
        question_id=question.id,
        code="P1",
        description="d",
        marks=2,
        point_type=PointType.CONCEPT,
    )
    db.add(point)
    results = {}
    for name in ("s1", "s2"):
        attempt = Attempt(
            id=uuid.uuid4(),
            paper_id=paper.id,
            scheme_id=scheme.id,
            student_ref=people[name].email,
            mode=AttemptMode.DIGITAL,
            status=AttemptStatus.SUBMITTED,
            max_score=2,
            submitted_at=datetime.now(UTC),
        )
        answer = Answer(attempt=attempt, question_id=question.id, text="x")
        result = PointResult(
            answer=answer, point=point, status=PointStatus.NEEDS_REVIEW, method=MarkingMethod.LLM
        )
        db.add_all([attempt, answer, result])
        results[name] = result
    db.commit()
    class_a = classes.create_class(db, "13 A", "2026")
    classes.set_teachers(db, class_a.id, [people["teacher_a"].id])
    classes.set_students(db, class_a.id, [people["s1"].id])
    class_b = classes.create_class(db, "13 B", "2026")
    classes.set_teachers(db, class_b.id, [people["teacher_b"].id])
    classes.set_students(db, class_b.id, [people["s2"].id])
    return {**people, "results": results, "class_a": class_a, "class_b": class_b}


def queue_refs(db, user):
    scope = classes.review_scope(db, user)
    return sorted(r.answer.attempt.student_ref for r in review.review_queue(db, scope=scope))


def test_teachers_see_only_their_own_class_and_admins_see_all(db):
    s = seed(db)

    assert queue_refs(db, s["teacher_a"]) == ["s1@school.lk"]
    assert queue_refs(db, s["teacher_b"]) == ["s2@school.lk"]
    assert queue_refs(db, s["admin"]) == ["s1@school.lk", "s2@school.lk"]
    scripts = review.review_scripts(db, scope=classes.review_scope(db, s["teacher_a"]))
    assert [script.student_ref for script in scripts] == ["s1@school.lk"]


def test_out_of_scope_points_and_attempts_answer_404(db):
    s = seed(db)
    scope = classes.review_scope(db, s["teacher_a"])
    other = s["results"]["s2"]

    with pytest.raises(NotFoundError):
        review.get_point(db, other.id, scope)
    with pytest.raises(NotFoundError):
        review.record_decision(db, other.id, ReviewDecisionIn(awarded=True), scope)
    with pytest.raises(NotFoundError):
        review.attempt_points(db, other.answer.attempt.id, scope)
    db.refresh(other)
    assert other.status == PointStatus.NEEDS_REVIEW and not other.reviews


def test_a_teacher_without_classes_and_an_archived_class_see_nothing(db):
    s = seed(db)
    lonely = User(email="tc@school.lk", name="TC", password_hash="h", role=UserRole.TEACHER)
    db.add(lonely)
    db.commit()

    assert queue_refs(db, lonely) == []
    classes.archive_class(db, s["class_a"].id)
    assert queue_refs(db, s["teacher_a"]) == []


def test_roster_membership_is_checked_by_role(db):
    s = seed(db)

    with pytest.raises(ContentValidationError):
        classes.set_teachers(db, s["class_a"].id, [s["s1"].id])  # a student cannot teach
    with pytest.raises(ContentValidationError):
        classes.set_students(db, s["class_a"].id, [s["teacher_b"].id])
    with pytest.raises(ContentValidationError):
        classes.set_students(db, s["class_a"].id, [999_999])
    updated = classes.set_students(db, s["class_a"].id, [s["s1"].id, s["s2"].id])  # s1 stays: no clash
    assert sorted(m.user_id for m in updated.students) == sorted([s["s1"].id, s["s2"].id])


# --- over HTTP ------------------------------------------------------------------------------

for module in ("openai", "google.genai", "cv2", "rdkit"):  # app.main imports them
    pytest.importorskip(module)


@pytest.fixture
def api(engine):
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app
    from app.security import current_user

    factory = sessionmaker(bind=engine, expire_on_commit=False)
    signed_in: dict[str, User] = {}

    def db_override():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: signed_in["user"]
    try:
        yield TestClient(app), signed_in
    finally:
        app.dependency_overrides.clear()


def test_routes_enforce_the_roster_and_record_the_signed_in_teacher(api, engine):
    client, signed_in = api
    with Session(engine, expire_on_commit=False) as session:
        s = seed(session)

    signed_in["user"] = s["teacher_a"]
    queue = client.get("/review/queue").json()
    assert [item["id"] for item in queue] == [s["results"]["s1"].id]
    assert {item["student_ref"] for item in queue} == {"s1@school.lk"}
    assert client.get(f"/review/points/{s['results']['s2'].id}/history").status_code == 404
    forged = client.post(
        f"/review/points/{s['results']['s2'].id}", json={"awarded": True, "teacher_ref": "tb@school.lk"}
    )
    assert forged.status_code == 404

    decided = client.post(
        f"/review/points/{s['results']['s1'].id}", json={"awarded": True, "teacher_ref": "someone-else"}
    )
    assert decided.status_code == 200
    history = client.get(f"/review/points/{s['results']['s1'].id}/history").json()
    assert [entry["teacher_ref"] for entry in history] == ["ta@school.lk"]  # not the body's value


def test_only_admins_manage_classes(api, engine):
    client, signed_in = api
    with Session(engine, expire_on_commit=False) as session:
        s = seed(session)

    signed_in["user"] = s["teacher_a"]
    assert client.get("/admin/classes").status_code == 403
    assert client.post("/admin/classes", json={"name": "x"}).status_code == 403

    signed_in["user"] = s["admin"]
    created = client.post("/admin/classes", json={"name": "12 C", "academic_year": "2027"})
    assert created.status_code == 201
    class_id = created.json()["id"]
    assert (
        client.put(f"/admin/classes/{class_id}/teachers", json={"user_ids": [s["teacher_b"].id]}).status_code
        == 200
    )
    bad = client.put(f"/admin/classes/{class_id}/students", json={"user_ids": [s["teacher_a"].id]})
    assert bad.status_code == 422
    listed = {c["name"]: c for c in client.get("/admin/classes").json()}
    assert listed["12 C"]["teacher_ids"] == [s["teacher_b"].id] and listed["12 C"]["student_ids"] == []
