"""Base response schema."""

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class BaseResponse(BaseModel, Generic[T]):
    """Base response model for all API responses.

    Attributes:
        code: Response code, 0 for success, non-zero for error
        message: Response message
        data: Response data payload
    """

    model_config = ConfigDict(extra="allow")

    code: int = 0
    message: str = "success"
    data: T | None = None
