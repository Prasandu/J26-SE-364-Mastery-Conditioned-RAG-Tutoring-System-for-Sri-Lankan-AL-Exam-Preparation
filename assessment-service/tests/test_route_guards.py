"""SEC-005c: every assessment route declares who may call it.

Walks the real application's dependency graph (not the source text), so a router-level
guard, a parametrised require_role(...) and nested dependencies all count. A new route
without a guard fails here unless it is added to PUBLIC on purpose, with a reason.
"""

import inspect
import os

os.environ.setdefault("DATABASE_URL", "sqlite://")

import pytest

for module in ("openai", "google.genai", "cv2", "rdkit"):  # app.main imports them
    pytest.importorskip(module)

from fastapi.routing import APIRoute  # noqa: E402

from app.main import app  # noqa: E402
from app.models import UserRole  # noqa: E402
from app.security import (  # noqa: E402
    current_user,
    optional_user,
    require_integration_caller,
    require_owned_attempt,
)

# No identity needed - and none of these reads student data or calls a model.
PUBLIC = {
    ("GET", "/health"): "process health",
    ("POST", "/auth/login"): "sign-in itself",
    ("POST", "/auth/register"): "account creation (role is always student)",
    ("GET", "/papers/practice/topics"): "syllabus topic catalogue",
    ("GET", "/papers/practice/rates"): "static minutes-per-question table",
    ("POST", "/papers/practice/plan"): "paper-shape calculator; no model call, nothing written",
}
# Identity optional: the handler itself limits what an anonymous caller sees
# (papers.get_visible_paper - tests/test_paper_access.py).
OPTIONAL = {("GET", "/papers"), ("GET", "/papers/{paper_id}"), ("GET", "/papers/{paper_id}/file")}


def _routes(routes):
    for route in routes:
        if isinstance(route, APIRoute):
            yield route
        elif hasattr(route, "original_router"):  # FastAPI's lazily included routers
            yield from _routes(route.original_router.routes)


def _guards(dependant, found: set[str]) -> set[str]:
    for dependency in dependant.dependencies:
        call = dependency.call
        if call is current_user:
            found.add("user")
        elif call is optional_user:
            found.add("optional")
        elif call is require_integration_caller:
            found.add("integration")
        elif call is require_owned_attempt:
            found.add("owner")
        elif inspect.isfunction(call):
            minimum = inspect.getclosurevars(call).nonlocals.get("minimum")
            if isinstance(minimum, UserRole):  # require_role(minimum)
                found.add(minimum.value)
        _guards(dependency, found)
    return found


ROUTES = {
    (method, route.path): _guards(route.dependant, set())
    for route in _routes(app.routes)
    for method in route.methods
}


def test_the_inventory_found_the_application_routes():
    assert len(ROUTES) > 80
    assert ("POST", "/attempts/{attempt_id}/submit") in ROUTES


def test_every_route_is_guarded_or_deliberately_public():
    unguarded = {key for key, guards in ROUTES.items() if not guards}

    assert unguarded - PUBLIC.keys() == set(), "new route without any guard"
    assert PUBLIC.keys() - unguarded == set(), "stale PUBLIC entry"


def test_optional_identity_only_where_the_handler_checks_visibility():
    assert {key for key, guards in ROUTES.items() if guards == {"optional"}} == OPTIONAL


def test_admin_and_resource_routes_need_an_admin():
    admin = {key: guards for key, guards in ROUTES.items() if key[1].startswith("/admin")}

    assert admin and all("admin" in guards for guards in admin.values())
    assert "admin" in ROUTES[("POST", "/auth/users/{user_id}/role")]


def test_review_routes_need_a_teacher():
    review = {key: guards for key, guards in ROUTES.items() if key[1].startswith("/review")}

    assert review and all("teacher" in guards for guards in review.values())


def test_integration_routes_need_a_component_key_and_accept_no_user():
    integration = {key: guards for key, guards in ROUTES.items() if key[1].startswith("/integration")}

    assert integration and all(guards == {"integration"} for guards in integration.values())


def test_attempt_routes_are_student_scoped_and_per_attempt_routes_check_the_owner():
    attempts = {key: guards for key, guards in ROUTES.items() if key[1].startswith("/attempts")}

    for (method, path), guards in attempts.items():
        if "{attempt_id}" in path:
            assert "owner" in guards, (method, path)
        else:
            assert "student" in guards, (method, path)
