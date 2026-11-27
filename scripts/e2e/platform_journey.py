"""Phase 5: one student's journey across all four services, on a disposable database.

    uv run --no-project --with "pyjwt[crypto]" --with httpx python scripts/e2e/platform_journey.py

What runs. A throwaway pgvector/PostgreSQL 16 container (127.0.0.1 only, random port and
password) with all four migration chains, exactly as scripts/db/shared_db_smoke.py builds
it. A local JWKS endpoint stands in for Supabase Auth and signs ES256 tokens for a student
A, a student B and a teacher. Then the real services start as separate processes:

- C2 assessment-service
- C3 planning-service (with a test topic registry; see run_planner.py)
- C4 support-service
- C1 lab API

Each is pinned to that database, with every AI provider disabled, and C2/C3/C4 run from an
empty working directory so no .env file is read.

The journey (each step is a check; the run fails if any check fails):

1. Sign-in: no token and an expired token are refused (401) by every service.
2. C2: A answers and submits a paper. The points need a teacher, so nothing is final yet.
   B cannot see A's attempt, and a student cannot mark.
3. The C2 -> C3 feed has nothing before the teacher decides; the seeded AI-only decision
   never appears; a wrong integration key is refused.
4. The teacher decides: the feed now has exactly those two teacher-verified points.
5. C3 pulls. The alias is awaiting review, so both marks are quarantined and A has no
   mastery. Once the (test) alias is approved, releasing applies them and A has mastery.
   Pulling again changes nothing. A wrong service key is refused.
6. Teacher correction: the corrected point supersedes the old one, and mastery moves.
7. Reassessment: a second attempt, marked by the teacher, updates mastery again.
8. Planner, tutor and lab, each with A's token: planner and tutor answer for A only (B is
   404 on A's data). The tutor's worked example is server-verified and AI-labelled. A lab
   practical is A's own and is 404 to B.
9. Mastery evidence is exactly the teacher-decided points: the AI-only decision never
   counted.

Nothing outside the container and the temporary directory is touched. Needs Docker, uv,
Node 22 and a built lab verifier (pnpm --filter @vlab/simulation-core build).
"""

from __future__ import annotations

import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "db"))
import shared_db_smoke as db  # noqa: E402 - reuses its container, psql and alembic helpers

TOPIC_CODE = "JOURNEY_FIXTURE"
CANONICAL_TOPIC = "chem-u3-mole-concept"
TORCH_INDEX = "https://download.pytorch.org/whl/cpu"
KEY = ec.generate_private_key(ec.SECP256R1())
KID = "journey"
PEOPLE = {
    "A": (str(uuid.uuid4()), "student.a@journey.test"),
    "B": (str(uuid.uuid4()), "student.b@journey.test"),
    "T": (str(uuid.uuid4()), "teacher@journey.test"),
}


# --- sign-in ---------------------------------------------------------------------------------


def token(who: str, minutes: int = 30) -> str:
    sub, email = PEOPLE[who]
    claims = {
        "sub": sub,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "exp": datetime.now(UTC) + timedelta(minutes=minutes),
        "user_metadata": {"name": f"Journey {who}"},
    }
    return jwt.encode(claims, KEY, algorithm="ES256", headers={"kid": KID})


def bearer(who: str | None, *, expired: bool = False) -> dict[str, str]:
    if who is None:
        return {}
    return {"Authorization": f"Bearer {token(who, minutes=-5 if expired else 30)}"}


def serve_jwks() -> tuple[ThreadingHTTPServer, str]:
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key()))
    body = json.dumps({"keys": [{**jwk, "kid": KID, "alg": "ES256", "use": "sig"}]}).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - http.server API
            ok = self.path.endswith("/.well-known/jwks.json")
            self.send_response(200 if ok else 404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            if ok:
                self.wfile.write(body)

        def log_message(self, *_: Any) -> None:
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}"


# --- services --------------------------------------------------------------------------------


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


class Service:
    def __init__(self, name: str, argv: list[str], cwd: Path, env: dict[str, str], log: Path) -> None:
        self.name, self.log = name, log
        self.port = int(env["JOURNEY_PORT"])
        self.url = f"http://127.0.0.1:{self.port}"
        self.process = subprocess.Popen(
            argv, cwd=cwd, env=env, stdout=log.open("w"), stderr=subprocess.STDOUT
        )

    def wait(self, health: str, timeout: float = 900) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                return False
            try:
                if httpx.get(self.url + health, timeout=2).status_code < 500:
                    return True
            except httpx.HTTPError:
                pass
            time.sleep(1)
        return False

    def stop(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.kill()

    def tail(self, lines: int = 12) -> str:
        try:
            return " | ".join(self.log.read_text(errors="replace").strip().splitlines()[-lines:])
        except OSError:
            return ""


def base_env(port: int, **extra: str) -> dict[str, str]:
    """No provider keys, no .env values: everything the service reads is set here."""
    env = {
        key: value
        for key, value in os.environ.items()
        if key
        in {
            "PATH",
            "SYSTEMROOT",
            "SystemRoot",
            "TEMP",
            "TMP",
            "HOME",
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "UV_CACHE_DIR",
            "UV_PYTHON_INSTALL_DIR",
            "PROGRAMDATA",
            "COMSPEC",
            "PATHEXT",
            "NUMBER_OF_PROCESSORS",
            "PROCESSOR_ARCHITECTURE",
        }
    }
    env.update(
        {
            "JOURNEY_PORT": str(port),
            "PYTHONUTF8": "1",
            "UV_LOCK_TIMEOUT": "3600",
            "HF_HUB_OFFLINE": "1",
            "TRANSFORMERS_OFFLINE": "1",
            "GROQ_API_KEY": "",
            "GEMINI_API_KEY": "",
            "OPENAI_API_KEY": "",
            "AI_API_KEY": "",
        }
    )
    env.update(extra)
    return env


def uvicorn_argv(python: str, requirements: Path, port: int, module: str = "app.main:app") -> list[str]:
    return [
        "uv",
        "run",
        "--no-project",
        "--python",
        python,
        "--with-requirements",
        str(requirements),
        "python",
        "-m",
        "uvicorn",
        module,
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
        "--log-level",
        "warning",
    ]


# --- the journey -----------------------------------------------------------------------------


def main() -> int:  # noqa: C901, PLR0915 - one linear script, read top to bottom
    results: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> bool:
        results.append((name, ok, detail))
        print(("PASS " if ok else "FAIL ") + name + (f" - {detail}" if detail and not ok else ""), flush=True)
        return ok

    work = Path(tempfile.mkdtemp(prefix="j26-journey-"))
    services: list[Service] = []
    jwks_server, jwks = serve_jwks()
    db.docker(
        "run",
        "-d",
        "--rm",
        "--name",
        db.NAME,
        "-p",
        "127.0.0.1::5432",
        "-e",
        f"POSTGRES_PASSWORD={db.PASSWORD}",
        "-e",
        f"POSTGRES_DB={db.DB}",
        db.IMAGE,
    )
    try:
        for _ in range(60):
            if (
                db.docker(
                    "exec", db.NAME, "pg_isready", "-U", "postgres", "-d", db.DB, check=False
                ).returncode
                == 0
            ):
                break
            time.sleep(1)
        time.sleep(2)
        port = db.docker("port", db.NAME, "5432").stdout.strip().splitlines()[0].rsplit(":", 1)[1]
        pg = f"postgres:{db.PASSWORD}@127.0.0.1:{port}/{db.DB}"

        # 0. One database, all four migration chains.
        db.psql(db.MOCK_SUPABASE)
        db.psql(db.SUPABASE_SEARCH_PATH)
        for migration in sorted((ROOT / "supabase" / "migrations").glob("*.sql")):
            db.psql(migration.read_text(encoding="utf-8"))
        for service in db.SERVICES:
            run = db.alembic(service, port)
            if not check(f"migrations: {service}", run.returncode == 0, (run.stderr or run.stdout)[-300:]):
                return 1

        # Requirements as CI installs them (assessment without the torch-based embedder).
        c2_reqs = work / "assessment-requirements.txt"
        c2_reqs.write_text(
            "".join(
                line + "\n"
                for line in (ROOT / "assessment-service" / "requirements.txt").read_text().splitlines()
                if not line.startswith("sentence-transformers")
            )
        )
        a_id, a_email = PEOPLE["A"]
        t_id, t_email = PEOPLE["T"]
        c2_env = base_env(
            free_port(),
            DATABASE_URL=f"postgresql+psycopg://{pg}",
            SUPABASE_URL=jwks,
            APP_ENV="development",
            INTEGRATION_KEY_COMPONENT3=secrets.token_urlsafe(24),
            PYTHONPATH=str(ROOT / "assessment-service"),
            JOURNEY_STUDENT_ID=a_id,
            JOURNEY_STUDENT_EMAIL=a_email,
            JOURNEY_TEACHER_ID=t_id,
            JOURNEY_TEACHER_EMAIL=t_email,
            JOURNEY_TOPIC_CODE=TOPIC_CODE,
        )
        c2_cwd = work / "c2"
        c2_cwd.mkdir()
        seeded = subprocess.run(
            [
                "uv",
                "run",
                "--no-project",
                "--python",
                "3.13",
                "--with-requirements",
                str(c2_reqs),
                "python",
                str(ROOT / "scripts" / "e2e" / "seed_assessment.py"),
            ],
            cwd=c2_cwd,
            env=c2_env,
            capture_output=True,
            text=True,
            check=False,
        )
        if not check("C2 fixture seeded", seeded.returncode == 0, seeded.stderr[-400:]):
            return 1
        fixture = json.loads(seeded.stdout.strip().splitlines()[-1])

        registry = work / "topic-registry.json"

        def write_registry(status: str | None) -> None:
            aliases = []
            if status:
                alias = {
                    "source": "assessment",
                    "code": TOPIC_CODE,
                    "topicId": CANONICAL_TOPIC,
                    "status": status,
                }
                if status == "approved":
                    alias |= {
                        "reviewedBy": "journey fixture (disposable database only)",
                        "reviewedAt": "2026-11-27",
                    }
                aliases.append(alias)
            registry.write_text(
                json.dumps(
                    {
                        "schemaVersion": "1.0.0",
                        "description": "Journey test registry - not the real DAT-009 registry",
                        "canonicalSource": "shared/contracts/topics.json",
                        "sources": ["assessment", "support", "lab"],
                        "aliases": aliases,
                    }
                ),
                encoding="utf-8",
            )

        write_registry("pending_review")
        ingest_key = secrets.token_urlsafe(24)
        c3_env = base_env(
            free_port(),
            DATABASE_URL=f"postgresql+psycopg://{pg}",
            SUPABASE_URL=jwks,
            INGEST_API_KEY=ingest_key,
            ASSESSMENT_SERVICE_URL=f"http://127.0.0.1:{c2_env['JOURNEY_PORT']}",
            ASSESSMENT_SERVICE_API_KEY=c2_env["INTEGRATION_KEY_COMPONENT3"],
            ENVIRONMENT="development",
            MODEL_DIR=str(ROOT / "planning-service" / "models"),
            JOURNEY_TOPIC_REGISTRY=str(registry),
            PYTHONPATH=str(ROOT / "planning-service"),
            UV_EXTRA_INDEX_URL=TORCH_INDEX,
            UV_INDEX_STRATEGY="unsafe-best-match",  # as CI: not stale certifi/idna from the torch index
        )
        c4_env = base_env(
            free_port(),
            DATABASE_URL=f"postgresql://{pg}",
            DB_SCHEMA="support",
            SUPABASE_URL=jwks,
            ENVIRONMENT="development",
            LLM_PROVIDER="groq",  # with no key: the provider reports itself unavailable
            PYTHONPATH=str(ROOT / "chemistry-tutor" / "support-service"),
            UV_EXTRA_INDEX_URL=TORCH_INDEX,
            UV_INDEX_STRATEGY="unsafe-best-match",
        )
        lab_env = base_env(
            free_port(),
            LAB_ENVIRONMENT="development",
            LAB_PRINCIPAL_PROVIDER="supabase_jwt",
            LAB_SUPABASE_URL=jwks,
            LAB_SUPABASE_JWKS_URL=f"{jwks}/auth/v1/.well-known/jwks.json",
            LAB_REPOSITORY="postgres",
            LAB_DATABASE_URL=f"postgresql://{pg}",
            LAB_ADMIN_MODE="disabled",
            LAB_ADMIN_REPOSITORY="file",
            LAB_ADMIN_EXTRACTION_ASSIST="disabled",
            LAB_LLM_PROVIDER="disabled",
            LAB_LLM_FAILOVER_ORDER="[]",
            LAB_EMBEDDING_PROVIDER="disabled",
            LAB_KNOWLEDGE_REPOSITORY="memory",
            LAB_CORS_ORIGINS='["http://localhost:5173"]',
        )
        for name in ("c3", "c4"):
            (work / name).mkdir()
        # The planner's own deployment step: its topic taxonomy (shared/contracts/topics.json).
        topics = subprocess.run(
            [
                "uv",
                "run",
                "--no-project",
                "--python",
                "3.12",
                "--with-requirements",
                str(ROOT / "planning-service" / "requirements-dev.txt"),
                "python",
                "-m",
                "scripts.seed_topics",
            ],
            cwd=work / "c3",
            env=c3_env,
            capture_output=True,
            text=True,
            check=False,
        )
        if not check("C3 topics seeded", topics.returncode == 0, topics.stderr[-400:]):
            return 1
        lab_argv = ["uv", "run", "--project", str(ROOT / "apps" / "api")]
        if (ROOT / "apps" / "api" / ".venv").exists():
            lab_argv.append("--no-sync")
        lab_argv += [
            "python",
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            lab_env["JOURNEY_PORT"],
            "--log-level",
            "warning",
        ]

        c2 = Service(
            "C2", uvicorn_argv("3.13", c2_reqs, int(c2_env["JOURNEY_PORT"])), c2_cwd, c2_env, work / "c2.log"
        )
        c3 = Service(
            "C3",
            [
                "uv",
                "run",
                "--no-project",
                "--python",
                "3.12",
                "--with-requirements",
                str(ROOT / "planning-service" / "requirements-dev.txt"),
                "python",
                str(ROOT / "scripts" / "e2e" / "run_planner.py"),
            ],
            work / "c3",
            c3_env,
            work / "c3.log",
        )
        c4 = Service(
            "C4",
            uvicorn_argv(
                "3.12",
                ROOT / "chemistry-tutor" / "support-service" / "requirements.txt",
                int(c4_env["JOURNEY_PORT"]),
            ),
            work / "c4",
            c4_env,
            work / "c4.log",
        )
        lab = Service("C1", lab_argv, ROOT / "apps" / "api", lab_env, work / "lab.log")
        services += [c2, c3, c4, lab]
        for service, health in ((c2, "/health"), (c3, "/health"), (c4, "/api/v1/health"), (lab, "/health")):
            if not check(f"{service.name} started", service.wait(health), service.tail()):
                return 1

        http = httpx.Client(timeout=60)

        def call(
            method: str,
            url: str,
            who: str | None = None,
            *,
            expired: bool = False,
            headers: dict[str, str] | None = None,
            **kw: Any,
        ) -> httpx.Response:
            return http.request(
                method, url, headers={**bearer(who, expired=expired), **(headers or {})}, **kw
            )

        # 1. Sign-in is required and checked everywhere.
        protected = {
            "C2": ("GET", f"{c2.url}/attempts"),
            "C3": ("GET", f"{c3.url}/api/v1/students/me/plan-readiness"),
            "C4": ("GET", f"{c4.url}/api/v1/students/{a_id}/progress"),
            "C1": ("GET", f"{lab.url}/sessions/{uuid.uuid4()}"),
        }
        for name, (method, url) in protected.items():
            check(f"1 {name}: no token is 401", call(method, url).status_code == 401)
            check(f"1 {name}: expired token is 401", call(method, url, "A", expired=True).status_code == 401)

        # 2. A answers and submits; marking needs the teacher.
        def attempt_and_submit(text: str) -> str:
            created = call("POST", f"{c2.url}/attempts", "A", json={"paper_id": fixture["paper_id"]})
            check("2 C2: A starts an attempt", created.status_code in (200, 201), created.text[:200])
            attempt_id = created.json()["id"]
            saved = call(
                "PUT",
                f"{c2.url}/attempts/{attempt_id}/answers/{fixture['question_id']}",
                "A",
                json={"text": text},
            )
            check("2 C2: A saves an answer", saved.status_code == 200, saved.text[:200])
            submitted = call("POST", f"{c2.url}/attempts/{attempt_id}/submit", "A")
            check("2 C2: A submits", submitted.status_code == 200, submitted.text[:200])
            return attempt_id

        first = attempt_and_submit("Journey answer one.")
        check(
            "2 C2: B cannot see A's attempt",
            call("GET", f"{c2.url}/attempts/{first}", "B").status_code == 404,
        )
        queue = call("GET", f"{c2.url}/review/queue", "T")
        check("2 C2: the teacher's queue has A's two points", queue.status_code == 200, queue.text[:200])
        mine = [item for item in queue.json() if str(item.get("attempt_id")) == first]
        check("2 C2: two points wait for the teacher", len(mine) == 2, json.dumps(queue.json())[:300])
        point_ids = {item["code"]: item["id"] for item in mine}
        refused = call("POST", f"{c2.url}/review/points/{point_ids.get('P1')}", "A", json={"awarded": True})
        check("2 C2: a student cannot mark", refused.status_code == 403, str(refused.status_code))

        # 3. The feed before any teacher decision.
        since = (datetime.now(UTC) - timedelta(days=7)).isoformat()
        feed_key = {"X-Integration-Key": c2_env["INTEGRATION_KEY_COMPONENT3"]}

        def feed() -> list[dict[str, Any]]:
            response = call("GET", f"{c2.url}/integration/events", headers=feed_key, params={"since": since})
            check(
                "3 C2: feed readable with the planner's key", response.status_code == 200, response.text[:200]
            )
            return [e for e in response.json()["events"] if e["subject_user_id"] == a_id]

        check("3 C2 feed: nothing final before the teacher decides (AI-only decision excluded)", feed() == [])
        wrong = call("GET", f"{c2.url}/integration/events", headers={"X-Integration-Key": "wrong-key-123456"})
        check("3 C2 feed: a wrong integration key is 401", wrong.status_code == 401)

        # 4. The teacher decides.
        def decide(result_id: int, awarded: bool) -> None:
            decided = call("POST", f"{c2.url}/review/points/{result_id}", "T", json={"awarded": awarded})
            check(f"4 C2: teacher decision awarded={awarded}", decided.status_code == 200, decided.text[:200])

        decide(point_ids["P1"], True)
        decide(point_ids["P2"], False)
        events = feed()
        check(
            "4 C2 feed: exactly the two teacher-verified points",
            sorted(e["source_entity_id"].rsplit("/", 1)[1] for e in events) == ["P1", "P2"]
            and all(e["evidence_class"] == "teacher_verified" for e in events),
            json.dumps(events)[:300],
        )
        check(
            "4 C2 feed: the AI-only decision never appears",
            not any(fixture["legacy_attempt"] in e["source_entity_id"] for e in events),
        )

        # 5. C3 pulls: quarantined until the alias is approved.
        ingest = {"X-API-Key": ingest_key}
        pull_url = f"{c3.url}/api/v1/integration/assessment"

        def pull(path: str = "/pull") -> dict[str, Any]:
            response = call("POST", pull_url + path, headers=ingest)
            check(f"5 C3: {path} accepted", response.status_code == 200, response.text[:200])
            return response.json()

        def mastery() -> float | None:
            out = db.psql(
                "select mastery from planning.learner_topic_state "
                f"where student_id = '{a_id}' and topic_id = '{CANONICAL_TOPIC}'"
            ).stdout.strip()
            return float(out) if out else None

        report = pull()
        check(
            "5 C3: unreviewed alias -> both marks quarantined",
            report["quarantined"] == 2 and report["applied"] == 0,
            json.dumps(report),
        )
        check("5 C3: no mastery from quarantined marks", mastery() is None)
        wrong = call("POST", pull_url + "/pull", headers={"X-API-Key": "wrong"})
        check("5 C3: a wrong service key is refused", wrong.status_code in (401, 403), str(wrong.status_code))
        write_registry("approved")
        report = pull("/quarantine/release")
        m1 = mastery()
        check(
            "5 C3: approved alias -> released and applied",
            report["released"] == 2 and m1 is not None,
            json.dumps(report),
        )
        report = pull()
        check(
            "5 C3: a repeated pull changes nothing",
            report["applied"] == 0 and mastery() == m1,
            json.dumps(report),
        )

        # 6. Teacher correction.
        decide(point_ids["P2"], True)
        report = pull()
        m2 = mastery()
        check(
            "6 C3: the correction supersedes the old decision", report["superseded"] >= 1, json.dumps(report)
        )
        check(
            "6 C3: mastery moves up after the correction",
            m1 is not None and m2 is not None and m2 > m1,
            f"{m1} -> {m2}",
        )

        # 7. Reassessment.
        second = attempt_and_submit("Journey answer two.")
        queue = call("GET", f"{c2.url}/review/queue", "T").json()
        for item in queue:
            if str(item.get("attempt_id")) == second:
                decide(item["id"], False)
        report = pull()
        m3 = mastery()
        check("7 C3: reassessment applied", report["applied"] == 2, json.dumps(report))
        check(
            "7 C3: mastery moves down after a weaker reassessment",
            m2 is not None and m3 is not None and m3 < m2,
            f"{m2} -> {m3}",
        )

        # 8. Planner, tutor and lab with the same sign-in.
        b_id = PEOPLE["B"][0]
        check("8 C3: A's dashboard", call("GET", f"{c3.url}/api/v1/dashboard", "A").status_code == 200)
        history = call("GET", f"{c3.url}/api/v1/students/me/topic-history/{CANONICAL_TOPIC}", "B")
        check(
            "8 C3: B's own history has none of A's marks",
            history.status_code == 200 and not history.json().get("attempts"),
            history.text[:200],
        )
        check(
            "8 C4: A reads A's progress",
            call("GET", f"{c4.url}/api/v1/students/{a_id}/progress", "A").status_code == 200,
        )
        # A self-only route: the id in the path is the caller's own, so 403 reveals nothing.
        check(
            "8 C4: A cannot read B's progress (403, self-only route)",
            call("GET", f"{c4.url}/api/v1/students/{b_id}/progress", "A").status_code == 403,
        )
        worked = call(
            "POST",
            f"{c4.url}/api/v1/teaching/worked-examples/solution-concentration",
            "A",
            json={"solute": "Na2CO3", "mass_g": 26.5, "molar_mass_g_per_mol": 106, "volume_cm3": 250},
        )
        check(
            "8 C4: worked example verified on the server and AI-labelled",
            worked.status_code == 200
            and worked.json()["status"] == "verified"
            and worked.json()["response"]["ai_generated"] is True,
            worked.text[:200],
        )
        definition = json.loads(
            (ROOT / "content" / "experiments" / "exp04" / "definition.v1.json").read_text("utf-8")
        )
        checklist = [r["id"] for r in definition["safetyRules"] if r["kind"] == "checklist"]
        created = call(
            "POST",
            f"{lab.url}/sessions",
            "A",
            json={
                "experimentId": definition["experimentId"],
                "experimentVersion": definition["definitionVersion"],
                "assessmentVersion": definition["assessmentRef"]["version"],
                "mode": "manual",
                "guidanceLevel": None,
                "locale": "en",
                "preLab": None,
            },
        )
        check("8 C1: A starts a practical", created.status_code == 201, created.text[:200])
        sid = created.json()["session"]["sessionId"]
        acted = call(
            "POST",
            f"{lab.url}/sessions/{sid}/actions",
            "A",
            json={
                "clientActionId": str(uuid.uuid4()),
                "expectedSequence": 0,
                "preview": False,
                "envelope": {
                    "action": {"type": "confirm_safety", "checklistItemIds": checklist},
                    "actor": "student",
                    "acknowledgedSafetyWarning": False,
                },
            },
        )
        check("8 C1: A's action is recorded", acted.status_code == 200, acted.text[:200])
        check(
            "8 C1: B gets 404 for A's practical",
            call("GET", f"{lab.url}/sessions/{sid}", "B").status_code == 404,
        )

        # 9. Evidence is only what a teacher decided.
        rows = db.psql(
            f"select count(*) from planning.topic_evidence where student_id = '{a_id}'"
        ).stdout.strip()
        check("9 C3: evidence rows = teacher-decided points now in force (2 + 2)", rows == "4", rows)
        return 0 if all(ok for _, ok, _ in results) else 1
    except Exception as error:  # noqa: BLE001 - report, then clean up
        check("journey run", False, repr(error))
        return 1
    finally:
        for service in services:
            service.stop()
        jwks_server.shutdown()
        removed = db.docker("rm", "-f", db.NAME, check=False).returncode == 0
        check("container removed", removed)
        failed = [name for name, ok, _ in results if not ok]
        print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
        if failed:
            for service in services:
                print(f"--- {service.name} log tail: {service.tail(6)}")


if __name__ == "__main__":
    raise SystemExit(main())
