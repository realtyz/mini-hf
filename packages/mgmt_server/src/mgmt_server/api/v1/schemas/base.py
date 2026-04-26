"""Base response schema."""

import re
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

from mgmt_server.core.exceptions import ValidationError

T = TypeVar("T")

# Matches HuggingFace repo_id format: namespace/repo-name
# Each segment allows alphanumeric, underscores, hyphens, and dots
_RE_REPO_ID = re.compile(r"^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$")


def _validate_repo_id(v: str) -> str:
    """Validate repo_id matches HuggingFace namespace/repo-name format."""
    if not _RE_REPO_ID.match(v):
        raise ValidationError(
            "repo_id must be in 'namespace/repo-name' format "
            "(alphanumeric, underscores, hyphens, and dots only)"
        )
    return v


RepoId = Annotated[
    str,
    Field(description="Repository ID in 'namespace/repo-name' format"),
    _validate_repo_id,
]


class PaginationQueryParams(BaseModel):
    """Common pagination and search query parameters."""

    skip: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=100)
    search: str | None = None


class BaseResponse(BaseModel, Generic[T]):
    """Base response model for all API responses.

    Attributes:
        code: Response code, 0 for success, non-zero for error
        message: Response message
        data: Response data payload
    """

    model_config = ConfigDict(extra="ignore")

    code: int = 0
    message: str = "success"
    data: T | None = None
