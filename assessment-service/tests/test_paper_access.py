"""SEC-PAPERS-IDOR: a student-facing route shows a paper only if it is published and
either shared (created_by is None) or the signed-in student's own practice paper.

Before the fix, GET /papers/{id}, GET /papers/{id}/file and POST /attempts looked the
paper up by id alone, so anyone (even anonymous) could read another student's practice
paper - and starting an attempt on it returned the whole question tree - while
GET /papers already hid it.

Two layers:
- the lookup itself (app/services/papers.py get_visible_paper), light dependencies;
- the HTTP routes through the real app with a throwaway SQLite database. These need
  the service's full requirements and are skipped where those are not installed.
"""

import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base
from app.errors import NotFoundError
from app.models import ContentStatus, Paper, PaperKind, User, UserRole
from app.services.papers import get_visible_paper

OWNER = "owner@school.lk"
OTHER = "other@school.lk"


def _engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return engine


@pytest.fixture
def db():
    with Session(_engine()) as session:
        yield session


def add_paper(db: Session, *, created_by: str | None, status=ContentStatus.PUBLISHED, file_key=None) -> Paper:
    paper = Paper(
        title="Paper", kind=PaperKind.MODEL, status=status, created_by=created_by, file_key=file_key
    )
    db.add(paper)
    db.commit()
    return paper


# --- the lookup -------------------------------------------------------------------


@pytest.mark.parametrize("viewer", [None, OWNER, OTHER])
def test_a_shared_published_paper_is_visible_to_everyone(db, viewer):
    shared = add_paper(db, created_by=None)

    assert get_visible_paper(db, shared.id, viewer).id == shared.id


def test_a_practice_paper_is_visible_to_its_owner(db):
    mine = add_paper(db, created_by=OWNER)

    assert get_visible_paper(db, mine.id, OWNER).id == mine.id


@pytest.mark.parametrize("viewer", [None, OTHER], ids=["anonymous", "another-student"])
def test_a_practice_paper_is_hidden_from_everyone_else(db, viewer):
    mine = add_paper(db, created_by=OWNER)

    with pytest.raises(NotFoundError) as error:
        get_visible_paper(db, mine.id, viewer)

    assert str(error.value) == "Paper not found"


@pytest.mark.parametrize("viewer", [None, OWNER])
def test_an_unpublished_paper_is_hidden_even_from_its_owner(db, viewer):
    draft = add_paper(db, created_by=None, status=ContentStatus.DRAFT)
    own_draft = add_paper(db, created_by=OWNER, status=ContentStatus.DRAFT)

    for paper in (draft, own_draft):
        with pytest.raises(NotFoundError):
            get_visible_paper(db, paper.id, viewer)


def test_denied_and_missing_papers_are_indistinguishable(db):
    """No existence leak: someone else's paper looks exactly like an id that is not there."""
    mine = add_paper(db, created_by=OWNER)

    with pytest.raises(NotFoundError) as denied:
        get_visible_paper(db, mine.id, OTHER)
    with pytest.raises(NotFoundError) as missing:
        get_visible_paper(db, 999_999, OTHER)

    assert str(denied.value) == str(missing.value)


def test_every_student_facing_paper_lookup_uses_the_owner_rule():
    """Route-level guard without importing the app: the student routes and the attempt
    start must call get_visible_paper, never the unscoped get_paper."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app"
    papers_api = (root / "api" / "papers.py").read_text(encoding="utf-8")
    attempts_service = (root / "services" / "attempts.py").read_text(encoding="utf-8")

    assert "papers.get_paper(" not in papers_api
    assert papers_api.count("papers.get_visible_paper(") == 2  # GET /papers/{id} and /file
    assert "get_visible_paper(db, data.paper_id, data.student_ref)" in attempts_service
    assert "get_paper(db, data.paper_id" not in attempts_service


# --- the HTTP routes (full requirements only) --------------------------------------


@pytest.fixture
def api():
    for module in ("openai", "google.genai", "cv2", "rdkit", "pypdfium2"):
        pytest.importorskip(module)
    from fastapi.testclient import TestClient

    from app.api.papers import get_paper_store
    from app.db import get_db
    from app.main import app
    from app.security import current_user, optional_user

    engine = _engine()
    make_session = sessionmaker(bind=engine)
    # expire_on_commit=False: the users are used (detached) by the overrides after this.
    with Session(engine, expire_on_commit=False) as setup:
        users = {
            email: User(email=email, name=email, password_hash="", role=UserRole.STUDENT)
            for email in (OWNER, OTHER)
        }
        setup.add_all(users.values())
        mine = Paper(
            title="Mine", kind=PaperKind.MODEL, status=ContentStatus.PUBLISHED, created_by=OWNER, file_key="k"
        )
        shared = Paper(title="Shared", kind=PaperKind.PAST, status=ContentStatus.PUBLISHED, file_key="s")
        setup.add_all([mine, shared])
        setup.commit()
        ids = {"mine": mine.id, "shared": shared.id}
        for user in users.values():
            setup.expunge(user)

    class RecordingStore:
        loads: list[str] = []

        def load(self, key: str) -> bytes:
            self.loads.append(key)
            return b"%PDF-1.4 test"

    store = RecordingStore()
    caller: dict[str, User | None] = {"user": None}

    def session():
        with make_session() as s:
            yield s

    def signed_in() -> User:
        if caller["user"] is None:
            from fastapi import HTTPException

            raise HTTPException(401, "Sign in to continue")
        return caller["user"]

    app.dependency_overrides.update(
        {
            get_db: session,
            get_paper_store: lambda: store,
            optional_user: lambda: caller["user"],
            current_user: signed_in,
        }
    )
    try:
        with TestClient(app) as client:
            yield client, ids, users, caller, store
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("who", [None, OTHER], ids=["anonymous", "another-student"])
def test_route_denies_someone_elses_practice_paper(api, who):
    client, ids, users, caller, store = api
    caller["user"] = users[who] if who else None

    detail = client.get(f"/papers/{ids['mine']}")
    pdf = client.get(f"/papers/{ids['mine']}/file")
    missing = client.get("/papers/999999")

    assert detail.status_code == pdf.status_code == missing.status_code == 404
    assert detail.json() == pdf.json() == missing.json()  # identical: no existence leak
    assert store.loads == []  # the PDF bytes were never read


def test_route_serves_the_owners_paper_and_pdf(api):
    client, ids, users, caller, store = api
    caller["user"] = users[OWNER]

    assert client.get(f"/papers/{ids['mine']}").status_code == 200
    pdf = client.get(f"/papers/{ids['mine']}/file")
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    assert store.loads == ["k"]


def test_route_serves_shared_papers_to_anonymous_visitors(api):
    client, ids, _, caller, _ = api
    caller["user"] = None

    assert client.get(f"/papers/{ids['shared']}").status_code == 200


def test_another_student_cannot_start_an_attempt_on_a_private_paper(api):
    client, ids, users, caller, _ = api
    caller["user"] = users[OTHER]

    response = client.post("/attempts", json={"paper_id": ids["mine"]})

    assert response.status_code == 404
    assert response.json() == client.get("/papers/999999").json()
