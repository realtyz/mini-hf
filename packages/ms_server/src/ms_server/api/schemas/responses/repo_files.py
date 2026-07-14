"""Response schemas for ModelScope file-tree endpoints.

These Pydantic models serve as documentation/type hints; the endpoints return
plain dicts (serialized directly to JSON), mirroring ``hf_server``'s style.
"""

from pydantic import BaseModel


class MsFileEntry(BaseModel):
    Path: str
    Type: str  # "blob" | "tree"
    Size: int
    Sha256: str | None = None
    BlobId: str | None = None


class MsFilesData(BaseModel):
    Files: list[MsFileEntry]
