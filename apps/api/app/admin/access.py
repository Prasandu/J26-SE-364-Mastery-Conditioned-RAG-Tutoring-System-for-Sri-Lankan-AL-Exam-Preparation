"""Development-only admin authorization (there is no production authentication yet).

Every admin request must satisfy ALL of the following server-side checks, otherwise it is
answered exactly like a missing route (404), so a non-local caller learns nothing:

1. ``LAB_ADMIN_MODE=development`` and ``LAB_ENVIRONMENT=development`` (startup refuses the
   combination anywhere else).
2. The TCP peer is a loopback address. Request headers are never trusted for identity.
3. No proxy-forwarding header is present (a local reverse proxy would otherwise make remote
   traffic look local).
4. The Host header names a loopback host (defeats DNS-rebinding from a browser).
5. If an Origin header is present it must be a loopback origin from ``LAB_CORS_ORIGINS``
   (defeats cross-site requests from other web pages).
6. Mutations use an exact, non-"simple" Content-Type, so browsers must pass the CORS preflight.

None of these is "authentication"; together they confine the capability to the developer's own
machine. Production publishing remains out of scope until real authentication and roles exist.
"""

import ipaddress
from urllib.parse import urlsplit

from fastapi import Request

from app.errors import ApiError
from app.settings import Settings

LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
PROXY_HEADERS = ("forwarded", "x-forwarded-for", "x-forwarded-host", "x-real-ip", "via")


def _not_found() -> ApiError:
    return ApiError(404, "not_found", "Not found")


def _is_loopback_ip(host: str | None) -> bool:
    if not host:
        return False
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def _hostname(value: str) -> str:
    """Host header -> bare hostname ("[::1]:8000" -> "::1", "localhost:8000" -> "localhost")."""
    value = value.strip().lower()
    if value.startswith("["):
        return value[1:].split("]", 1)[0]
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def is_loopback_origin(origin: str) -> bool:
    parts = urlsplit(origin)
    return parts.scheme in ("http", "https") and (parts.hostname or "") in LOOPBACK_HOSTS


def require_dev_admin(request: Request, settings: Settings) -> None:
    """Raise 404 unless this is a verified local development-admin request."""
    if settings.admin_mode != "development" or settings.environment != "development":
        raise _not_found()
    client = request.client.host if request.client else None
    if not _is_loopback_ip(client):
        raise _not_found()
    headers = request.headers
    if any(name in headers for name in PROXY_HEADERS):
        raise _not_found()
    if _hostname(headers.get("host", "")) not in LOOPBACK_HOSTS:
        raise _not_found()
    origin = headers.get("origin")
    if origin is not None and not (is_loopback_origin(origin) and origin in settings.cors_origins):
        raise _not_found()


def require_content_type(request: Request, expected: str) -> None:
    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != expected:
        raise ApiError(415, "unsupported_media_type", f"Content-Type must be {expected}")
