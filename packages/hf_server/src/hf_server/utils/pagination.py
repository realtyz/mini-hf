"""Cursor-based pagination utilities."""

import base64


class CursorError(Exception):
    """Raised when cursor encoding/decoding fails."""
    pass


def encode_cursor(path: str) -> str:
    """Encode a path string to base64 cursor.

    Args:
        path: The file/directory path to encode

    Returns:
        Base64-encoded cursor string (URL-safe, no padding)

    Example:
        >>> encode_cursor("models/llama/config.json")
        "bW9kZWxzL2xsYW1hL2NvbmZpZy5qc29u"
    """
    # Use URL-safe base64 to avoid URL encoding issues
    # Remove padding (=) to make URLs cleaner
    path_bytes = path.encode("utf-8")
    cursor = base64.urlsafe_b64encode(path_bytes).rstrip(b"=").decode("ascii")
    return cursor


def decode_cursor(cursor: str) -> str:
    """Decode a base64 cursor back to path string.

    Args:
        cursor: Base64-encoded cursor string

    Returns:
        Decoded path string

    Raises:
        CursorError: If cursor is invalid or malformed

    Example:
        >>> decode_cursor("bW9kZWxzL2xsYW1hL2NvbmZpZy5qc29u")
        "models/llama/config.json"
    """
    if not cursor:
        raise CursorError("Cursor cannot be empty")

    try:
        # Add back padding if needed
        # Base64 encoding requires padding to multiple of 4
        padding_needed = 4 - (len(cursor) % 4)
        if padding_needed != 4:
            cursor += "=" * padding_needed

        path_bytes = base64.urlsafe_b64decode(cursor)
        return path_bytes.decode("utf-8")
    except (ValueError, UnicodeDecodeError) as e:
        raise CursorError(f"Invalid cursor format: {e}")
