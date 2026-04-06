"""JSON serializer implementation."""

import json
from typing import Any

from cache.serializers.base import Serializer


class JSONSerializer(Serializer):
    """JSON serializer for cache values."""

    def serialize(self, value: Any) -> str:
        """Serialize value to JSON string."""
        return json.dumps(value)

    def deserialize(self, data: str | bytes | None) -> Any:
        """Deserialize JSON string to Python object."""
        if data is None:
            return None
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return json.loads(data)
