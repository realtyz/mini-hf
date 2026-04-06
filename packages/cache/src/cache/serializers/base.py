"""Serializer abstract base class."""

from abc import ABC, abstractmethod
from typing import Any


class Serializer(ABC):
    """Abstract base class for cache value serializers."""

    @abstractmethod
    def serialize(self, value: Any) -> str | bytes:
        """Serialize a value to string or bytes.

        Args:
            value: The value to serialize.

        Returns:
            Serialized representation of the value.
        """
        ...

    @abstractmethod
    def deserialize(self, data: str | bytes | None) -> Any:
        """Deserialize data back to Python object.

        Args:
            data: The serialized data.

        Returns:
            The deserialized Python object.
        """
        ...
