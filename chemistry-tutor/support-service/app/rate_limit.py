from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

# Shared by main.py (registers it on app.state) and every LLM-backed router
# (applies @limiter.limit(...) to individual endpoints). Lives in its own
# module so routers can import it without a circular import on app.main.
# In-memory storage: fine for this single-instance deployment, resets on
# restart. Would need a shared backend (e.g. Redis) behind multiple workers.
# Paid provider calls (LLM, speech): a per-minute burst limit and a per-day cap, per user.
PAID_TUTOR_LIMIT = "20/minute;200/day"
PAID_VOICE_LIMIT = "10/minute;100/day"
PAID_REPORT_LIMIT = "10/minute;50/day"


def principal_key(request: Request) -> str:
    """The signed-in user when known (get_current_user_id stores it), else the client IP.
    Behind a proxy every student shares one IP, so per-IP limits alone would let one
    student exhaust everyone's quota - and not cap any single student."""
    user_id = getattr(request.state, "user_id", None)
    return f"user:{user_id}" if user_id else f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=principal_key)
