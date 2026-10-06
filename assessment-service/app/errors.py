"""Errors raised by the service layer. app/main.py turns them into HTTP responses."""


class DomainError(Exception):
    status_code = 400

    def __init__(self, message: str, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors = errors or []


class NotFoundError(DomainError):
    status_code = 404


class ConflictError(DomainError):
    """The request is valid, but not allowed in the content's current state (e.g. editing published)."""

    status_code = 409


class ContentValidationError(DomainError):
    """The content breaks a paper / marking-scheme rule. `errors` lists every problem found."""

    status_code = 422


class ConfigurationError(DomainError):
    """The .env settings do not make sense (e.g. a provider without its URL)."""

    status_code = 503
