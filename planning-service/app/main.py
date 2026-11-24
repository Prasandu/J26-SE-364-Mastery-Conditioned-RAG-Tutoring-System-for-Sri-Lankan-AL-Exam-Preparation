from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.dashboard import router as dashboard_router
from app.api.demo import router as demo_router
from app.api.events import router as events_router
from app.api.motivation import router as motivation_router
from app.api.notifications import router as notifications_router
from app.api.plans import router as plans_router
from app.api.predictions import router as predictions_router
from app.api.students import router as students_router
from app.api.tasks import router as tasks_router
from app.config import settings
from app.errors import register_error_handlers

app = FastAPI(
    title="Planning Service",
    description="Adaptive study planning and learning analytics.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)
app.include_router(dashboard_router)
app.include_router(demo_router)
app.include_router(events_router)
app.include_router(motivation_router)
app.include_router(notifications_router)
app.include_router(plans_router)
app.include_router(predictions_router)
app.include_router(students_router)
app.include_router(tasks_router)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    """Expose a lightweight process health check without depending on the database."""
    return {"status": "ok", "service": "planning-service"}
