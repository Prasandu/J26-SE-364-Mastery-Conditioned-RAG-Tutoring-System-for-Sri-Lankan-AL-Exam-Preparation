import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, TypeVar
from uuid import UUID

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from app.content import load_experiments
from app.contracts import ContractRegistry
from app.errors import ApiError, correlation_id_var, install_error_handlers, new_correlation_id
from app.models import (
    ActionSubmission,
    AssistantAskRequest,
    CreateSessionRequest,
    NotebookSaveRequest,
)
from app.principal import Principal, PrincipalProvider, build_principal_provider
from app.rag.assistant import AssistantService, build_assistant
from app.repositories import InMemoryRepositories, in_memory_repositories
from app.service import SessionService
from app.settings import Settings, get_settings
from app.verifier import NodeCliVerifier, Verifier

API_VERSION = "0.2.0"
logger = logging.getLogger("vlab.api")
M = TypeVar("M", bound=BaseModel)


@dataclass
class AppState:
    settings: Settings
    contracts: ContractRegistry
    service: SessionService
    verifier: Verifier
    store: InMemoryRepositories
    principal_provider: PrincipalProvider
    assistant: AssistantService


def create_app(
    settings: Settings | None = None,
    *,
    verifier: Verifier | None = None,
    service_factory: Callable[..., SessionService] | None = None,
    assistant: AssistantService | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    settings.validate_for_startup()
    contracts = ContractRegistry(settings.schema_dir)
    repos, store = in_memory_repositories(load_experiments(settings.content_dir, contracts))
    verifier = verifier or NodeCliVerifier(
        node=settings.resolved_node(),
        script=settings.verifier_script,
        engine_version=settings.engine_version(),
        contracts=contracts,
        timeout_seconds=settings.verifier_timeout_seconds,
        max_bytes=settings.verifier_max_bytes,
    )
    factory = service_factory or SessionService
    seed_kwargs: dict[str, Any] = {}
    if settings.fixed_seed is not None:
        fixed = settings.fixed_seed
        seed_kwargs["seed"] = lambda: fixed
    service = factory(
        repos, verifier, utc_offset_minutes=settings.utc_offset_minutes, **seed_kwargs
    )
    state = AppState(
        settings,
        contracts,
        service,
        verifier,
        store,
        build_principal_provider(settings.principal_provider),
        assistant or build_assistant(settings),
    )

    app = FastAPI(
        title="Virtual Chemistry Laboratory API", version=API_VERSION, docs_url=None, redoc_url=None
    )
    app.state.lab = state
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Content-Type", "X-Correlation-ID"],
        expose_headers=["X-Correlation-ID"],
    )

    @app.middleware("http")
    async def correlation(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        token = correlation_id_var.set(new_correlation_id(request.headers.get("X-Correlation-ID")))
        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = correlation_id_var.get()
            return response
        finally:
            correlation_id_var.reset(token)

    def lab(request: Request) -> AppState:
        result: AppState = request.app.state.lab
        return result

    def principal(request: Request) -> Principal:
        return lab(request).principal_provider(request)

    async def read_json(request: Request, schema: str, model: type[M]) -> M:
        """Size-limited JSON body validated against the contract schema, then typed."""
        declared = request.headers.get("content-length")
        limit = lab(request).settings.max_request_bytes
        if declared and declared.isdigit() and int(declared) > limit:
            raise ApiError(413, "request_too_large", "Request body is too large")
        body = await request.body()
        if len(body) > limit:
            raise ApiError(413, "request_too_large", "Request body is too large")
        try:
            data = json.loads(body)
        except ValueError as exc:
            raise ApiError(400, "invalid_request", "Request body is not valid JSON") from exc
        lab(request).contracts.require(schema, data)
        try:
            return model.model_validate(data)
        except ValidationError as exc:
            raise ApiError(
                422, "invalid_request", "Request does not match the API contract"
            ) from exc

    def session_id(raw: str) -> UUID:
        try:
            return UUID(raw)
        except ValueError as exc:
            raise ApiError(404, "not_found", "Session not found") from exc

    @app.get("/health")
    def health(request: Request) -> dict[str, Any]:
        st = lab(request)
        ready = st.verifier.ready()
        routing = getattr(st.assistant.provider, "health", None)
        return {
            "status": "ok" if ready else "degraded",
            "version": API_VERSION,
            "environment": st.settings.environment,
            "adapters": {
                "repository": st.settings.repository,
                "llm": st.settings.llm_provider,
                "llmModel": st.assistant.provider.model
                if st.settings.llm_provider in ("openai", "groq", "failover")
                else None,
                "llmRouting": routing() if callable(routing) else None,
                "embeddings": st.settings.embedding_provider,
            },
            "verifier": {
                "ready": ready,
                "engineVersion": st.settings.engine_version() if ready else None,
            },
        }

    @app.get("/experiments")
    def experiments(request: Request) -> list[dict[str, Any]]:
        return lab(request).service.list_experiments()

    @app.get("/experiments/{experiment_id}")
    def experiment(experiment_id: str, request: Request) -> dict[str, Any]:
        return lab(request).service.experiment_details(experiment_id)

    @app.post("/sessions", status_code=201)
    async def create_session(
        request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        req = await read_json(request, "api-create-session-request", CreateSessionRequest)
        return await lab(request).service.create_session(who, req)

    @app.get("/sessions/{sid}")
    async def get_session(
        sid: str, request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        return await lab(request).service.get_session(who, session_id(sid))

    @app.post("/sessions/{sid}/actions")
    async def submit_action(
        sid: str, request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        sub = await read_json(request, "api-action-submission", ActionSubmission)
        return await lab(request).service.submit_action(who, session_id(sid), sub)

    @app.put("/sessions/{sid}/notebook")
    async def save_notebook(
        sid: str, request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        req = await read_json(request, "api-notebook-save-request", NotebookSaveRequest)
        return lab(request).service.save_notebook(who, session_id(sid), req)

    @app.get("/sessions/{sid}/report")
    async def report(
        sid: str, request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        return await lab(request).service.report(who, session_id(sid))

    @app.post("/assistant/ask")
    async def ask_assistant(
        request: Request, who: Principal = Depends(principal)
    ) -> dict[str, Any]:
        st = lab(request)
        req = await read_json(request, "api-assistant-ask-request", AssistantAskRequest)
        if not req.question.strip():
            raise ApiError(422, "invalid_request", "Question is empty")
        session = st.service.owned_session(who, req.sessionId)
        body = await st.assistant.ask(session, req.question.strip(), req.locale)
        if not st.contracts.is_valid("api-assistant-answer", body):
            logger.error("assistant response failed its contract")
            raise ApiError(500, "assistant_invalid_response", "The assistant response was invalid")
        return body

    return app


def _lazy_app() -> FastAPI:
    return create_app()


app = _lazy_app()
