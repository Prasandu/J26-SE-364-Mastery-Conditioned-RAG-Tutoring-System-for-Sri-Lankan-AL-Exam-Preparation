import json
import shutil
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
REPO_ROOT_ENV = REPO_ROOT / ".env"


class ConfigurationError(RuntimeError):
    """Raised at startup when the configuration is unsafe or incomplete."""


class Settings(BaseSettings):
    """Server-side configuration. Secrets come only from the environment or an untracked .env."""

    model_config = SettingsConfigDict(env_prefix="LAB_", env_file=REPO_ROOT_ENV, extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    repository: Literal["memory", "postgres"] = "memory"
    database_url: SecretStr | None = None
    #: disabled (default) | fake (development/test only) | openai | groq | ollama (local model on
    #: this machine) | failover (ordered providers, default groq then openai; technical failures
    #: only, see D30).
    llm_provider: Literal["disabled", "fake", "openai", "groq", "ollama", "failover"] = "disabled"
    #: OpenAI model; required for openai and failover. Never hard-coded (documented in .env).
    llm_model: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$")
    llm_reasoning_effort: Literal["none", "minimal", "low", "medium", "high"] = "low"
    # Structured answers repeat text in claims and supporting spans; 512 can truncate valid JSON.
    llm_max_output_tokens: int = Field(default=2048, ge=64, le=4096)
    llm_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    #: Server-side only; read from OPENAI_API_KEY. Never logged, returned or sent to the client.
    openai_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("OPENAI_API_KEY", "LAB_OPENAI_API_KEY")
    )
    #: Groq model; required for groq and failover (documented candidate: qwen/qwen3.8-27b).
    groq_model: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")
    #: Server-side only; read from GROQ_API_KEY. Never logged, returned or sent to the client.
    groq_api_key: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("GROQ_API_KEY", "LAB_GROQ_API_KEY")
    )
    #: Local Ollama server (OpenAI-compatible endpoint). Loopback only: documents and questions
    #: never leave this machine through this provider.
    ollama_base_url: str = "http://127.0.0.1:11434/v1"
    #: Ollama model tag (for example a Qwen or Llama model pulled locally); required for ollama.
    ollama_model: str | None = Field(default=None, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,63}$")
    ollama_timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    llm_failover_order: list[Literal["groq", "openai"]] = ["groq", "openai"]
    llm_primary_timeout_seconds: float = Field(default=12.0, gt=0, le=120)
    llm_fallback_timeout_seconds: float = Field(default=18.0, gt=0, le=120)
    llm_total_deadline_seconds: float = Field(default=30.0, gt=0, le=180)
    llm_circuit_cooldown_seconds: float = Field(default=60.0, ge=1, le=3600)
    #: Paid fallback calls allowed per UTC day (process-local); 0 disables paid fallback.
    openai_fallback_daily_request_limit: int = Field(default=50, ge=0, le=100_000)

    #: Development-only practical administration (drafts, PDF imports, review). Disabled by
    #: default; refused at startup outside the development environment. There is no production
    #: authentication yet, so this never grants anything outside a verified loopback request.
    admin_mode: Literal["disabled", "development"] = "disabled"
    #: Private, gitignored draft storage. Must never point into content/ (student definitions).
    admin_data_dir: Path = REPO_ROOT / "data" / "admin"
    admin_max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1024, le=25 * 1024 * 1024)
    admin_max_pages: int = Field(default=400, ge=1, le=400)
    admin_extract_timeout_seconds: float = Field(default=60.0, gt=0, le=300)
    #: Where admin records live: file (private JSON under admin_data_dir; zero setup) | postgres
    #: (LAB_DATABASE_URL; uploaded PDFs stay content-addressed on disk either way).
    admin_repository: Literal["file", "postgres"] = "file"
    #: Optional AI help for extraction. Local only by design: disabled (default) | ollama (needs
    #: LAB_OLLAMA_MODEL) | fake (tests). External providers are deliberately not an option.
    admin_extraction_assist: Literal["disabled", "ollama", "fake"] = "disabled"
    #: Knowledge-base store shared by the assistant and the admin knowledge feed:
    #: memory (private files under knowledge_data_dir / admin_data_dir) | postgres (pgvector).
    knowledge_repository: Literal["memory", "postgres"] = "memory"
    embedding_provider: Literal["disabled", "fake", "e5_local"] = "disabled"
    embedding_model: str = "intfloat/multilingual-e5-small"
    #: Pinned model revision; defaults to the revision recorded in the knowledge manifest.
    embedding_revision: str | None = None
    knowledge_manifest: Path = REPO_ROOT / "content" / "knowledge" / "manifest.v1.json"
    #: Private, gitignored chunk text and embeddings (never served, never deployed to the client).
    knowledge_data_dir: Path = REPO_ROOT / "data" / "knowledge"
    cors_origins: list[str] = ["http://localhost:5173"]
    principal_provider: Literal["development", "test", "supabase_jwt"] = "development"

    content_dir: Path = REPO_ROOT / "content"
    schema_dir: Path = REPO_ROOT / "packages" / "contracts" / "schema"
    engine_package_json: Path = REPO_ROOT / "packages" / "simulation-core" / "package.json"
    verifier_script: Path = REPO_ROOT / "packages" / "simulation-core" / "dist" / "verifier.mjs"
    verifier_node: str | None = None
    verifier_timeout_seconds: float = 10.0
    verifier_max_bytes: int = 4 * 1024 * 1024

    max_request_bytes: int = 256 * 1024
    #: Sri Lanka uses UTC+05:30 all year; session dates follow the learner's local calendar.
    utc_offset_minutes: int = 330
    #: Deterministic seed for tests only; rejected in other environments.
    fixed_seed: int | None = None

    def resolved_node(self) -> str | None:
        """Absolute path to the Node executable for the verifier (resolved once, at startup)."""
        candidate = self.verifier_node or shutil.which("node")
        return str(Path(candidate).resolve()) if candidate else None

    def engine_version(self) -> str:
        data = json.loads(self.engine_package_json.read_text(encoding="utf-8"))
        return str(data["version"])

    def validate_for_startup(self) -> None:
        if self.admin_mode == "development":
            if self.environment != "development":
                raise ConfigurationError(
                    "Development admin mode is only allowed in the development environment"
                )
            data = self.admin_data_dir.resolve()
            content = self.content_dir.resolve()
            if data == content or content in data.parents:
                raise ConfigurationError("LAB_ADMIN_DATA_DIR must not be inside content/")
        if "*" in self.cors_origins:
            raise ConfigurationError("Wildcard CORS origins are not allowed")
        if self.environment == "production" and self.principal_provider != "supabase_jwt":
            raise ConfigurationError("Production requires a real authentication provider")
        if self.principal_provider == "test" and self.environment != "test":
            raise ConfigurationError("The test principal is only allowed in the test environment")
        if self.fixed_seed is not None and self.environment != "test":
            raise ConfigurationError("A fixed seed is only allowed in the test environment")
        if self.llm_provider == "fake" and self.environment == "production":
            raise ConfigurationError("The fake generation provider is not allowed in production")
        needs = {
            "openai": {"openai"},
            "groq": {"groq"},
            "failover": {"groq", "openai"},
        }.get(self.llm_provider, set())
        if "openai" in needs:
            if not self.llm_model:
                raise ConfigurationError(
                    f"LAB_LLM_MODEL is required when LAB_LLM_PROVIDER={self.llm_provider}"
                )
            if not _secret(self.openai_api_key):
                raise ConfigurationError(
                    f"OPENAI_API_KEY is required when LAB_LLM_PROVIDER={self.llm_provider}"
                )
        if "groq" in needs:
            if not self.groq_model:
                raise ConfigurationError(
                    f"LAB_GROQ_MODEL is required when LAB_LLM_PROVIDER={self.llm_provider}"
                )
            if not _secret(self.groq_api_key):
                raise ConfigurationError(
                    f"GROQ_API_KEY is required when LAB_LLM_PROVIDER={self.llm_provider}"
                )
        if self.llm_provider == "failover":
            order = self.llm_failover_order
            if len(order) != 2 or set(order) != {"groq", "openai"}:
                raise ConfigurationError("LAB_LLM_FAILOVER_ORDER must list groq and openai once")
            if self.llm_total_deadline_seconds < self.llm_primary_timeout_seconds:
                raise ConfigurationError("The total deadline must cover the primary timeout")
        if self.llm_provider == "ollama" or self.admin_extraction_assist == "ollama":
            if not self.ollama_model:
                raise ConfigurationError("LAB_OLLAMA_MODEL is required to use the Ollama provider")
            if not _loopback_url(self.ollama_base_url):
                raise ConfigurationError(
                    "LAB_OLLAMA_BASE_URL must point to this machine (loopback)"
                )
        if self.admin_extraction_assist == "fake" and self.environment != "test":
            raise ConfigurationError("The fake extraction assistant is only allowed in tests")
        needs_db = []
        if self.admin_repository == "postgres":
            needs_db.append("LAB_ADMIN_REPOSITORY")
        if self.knowledge_repository == "postgres":
            needs_db.append("LAB_KNOWLEDGE_REPOSITORY")
        if needs_db and not _secret(self.database_url):
            raise ConfigurationError(
                f"LAB_DATABASE_URL is required for {', '.join(needs_db)}=postgres"
            )
        if self.embedding_provider == "fake" and self.environment == "production":
            raise ConfigurationError("The fake embedding provider is not allowed in production")
        if self.repository == "postgres":
            raise ConfigurationError("The PostgreSQL repository is not implemented in M1")


def _secret(value: SecretStr | None) -> bool:
    return bool(value and value.get_secret_value().strip())


def _loopback_url(url: str) -> bool:
    from urllib.parse import urlsplit

    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    return parts.scheme in ("http", "https") and parts.hostname in ("127.0.0.1", "localhost", "::1")


@lru_cache
def get_settings() -> Settings:
    return Settings()
