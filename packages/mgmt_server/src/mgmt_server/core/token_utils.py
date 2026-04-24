"""Token encoding/decoding utilities for preview tasks."""

import base64


def encode_access_token(token: str | None) -> str | None:
    """Encode access token for safe storage in cache."""
    if token is None:
        return None
    return base64.b64encode(token.encode()).decode()


def decode_access_token(encoded: str | None) -> str | None:
    """Decode access token from cache storage."""
    if encoded is None:
        return None
    return base64.b64decode(encoded.encode()).decode()
