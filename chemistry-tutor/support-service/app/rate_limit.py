from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared by main.py (registers it on app.state) and every LLM-backed router
# (applies @limiter.limit(...) to individual endpoints). Lives in its own
# module so routers can import it without a circular import on app.main.
# In-memory storage: fine for this single-instance deployment, resets on
# restart. Would need a shared backend (e.g. Redis) behind multiple workers.
limiter = Limiter(key_func=get_remote_address)
