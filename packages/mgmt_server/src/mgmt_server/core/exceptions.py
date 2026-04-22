"""Business exceptions with HTTP status code semantics."""


class BusinessError(Exception):
    """Base business exception that carries an HTTP status code."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class NotFoundError(BusinessError):
    """Resource not found (404)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=404)


class ConflictError(BusinessError):
    """Request conflicts with current state (409)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=409)


class PermissionDeniedError(BusinessError):
    """Permission denied (403)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=403)


class GoneError(BusinessError):
    """Resource no longer available (410)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=410)


class ValidationError(BusinessError):
    """Input validation failure (400)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=400)
