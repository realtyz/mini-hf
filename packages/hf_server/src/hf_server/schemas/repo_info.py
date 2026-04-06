from pydantic import BaseModel


class RepoInfoResponse(BaseModel):
    """Response schema for model/dataset info endpoints."""

    id: int
    sha: str
    private: bool = False
    gated: bool = False
    disabled: bool = False
