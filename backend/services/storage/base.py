from __future__ import annotations

from abc import ABC, abstractmethod


class StorageBackend(ABC):

    @abstractmethod
    async def read(self, path: str) -> bytes:
        """Read a file by its relative path. Raises FileNotFoundError if missing."""

    @abstractmethod
    async def write(self, path: str, content: bytes) -> None:
        """Write content to a path, creating parent directories as needed."""

    @abstractmethod
    async def delete(self, path: str) -> None:
        """Delete a file. Raises FileNotFoundError if missing."""

    @abstractmethod
    async def list(self, prefix: str) -> list[str]:
        """List all file paths under a prefix."""

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """Check if a file exists."""

    @abstractmethod
    async def read_version(self, path: str, version_id: str) -> bytes:
        """Read a specific stored version of a file."""

    @abstractmethod
    async def list_versions(self, path: str) -> list[dict]:
        """
        List stored versions of a file.
        Returns: [{ version_id, size, last_modified, is_latest }]
        """
