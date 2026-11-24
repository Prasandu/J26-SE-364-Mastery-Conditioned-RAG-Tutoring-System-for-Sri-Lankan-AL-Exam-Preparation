from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class PlanningError(Exception):
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFound(PlanningError):
    status_code = 404


class Conflict(PlanningError):
    status_code = 409


class ConstraintViolation(PlanningError):
    status_code = 422


class UpstreamServiceError(PlanningError):
    status_code = 502


class ServiceUnavailable(PlanningError):
    status_code = 503


async def planning_error_handler(
    request: Request,
    exc: PlanningError,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(PlanningError, planning_error_handler)
