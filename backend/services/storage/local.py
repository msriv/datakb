from __future__ import annotations

from pathlib import Path

from services.storage.base import StorageBackend


class LocalAdapter(StorageBackend):
    def __init__(self, base_path: str):
        self.base = Path(base_path)
        self.base.mkdir(parents=True, exist_ok=True)

    def _full(self, path: str) -> Path:
        return self.base / path

    async def read(self, path: str) -> bytes:
        full = self._full(path)
        if not full.exists():
            raise FileNotFoundError(path)
        return full.read_bytes()

    async def write(self, path: str, content: bytes) -> None:
        full = self._full(path)
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(content)

    async def delete(self, path: str) -> None:
        full = self._full(path)
        if not full.exists():
            raise FileNotFoundError(path)
        full.unlink()

    async def list(self, prefix: str) -> list[str]:
        prefix_path = self._full(prefix)
        if not prefix_path.exists():
            return []
        return [str(f.relative_to(self.base)) for f in prefix_path.rglob("*") if f.is_file()]

    async def exists(self, path: str) -> bool:
        return self._full(path).exists()

    async def read_version(self, path: str, version_id: str) -> bytes:
        version_path = self.base / f"{path}.versions" / version_id
        if not version_path.exists():
            raise FileNotFoundError(f"Version {version_id} of {path} not found")
        return version_path.read_bytes()

    async def list_versions(self, path: str) -> list[dict]:
        versions_dir = self.base / f"{path}.versions"
        if not versions_dir.exists():
            return []
        versions = []
        for f in versions_dir.iterdir():
            if f.is_file():
                stat = f.stat()
                versions.append({
                    "version_id": f.name,
                    "last_modified": stat.st_mtime,
                    "size": stat.st_size,
                    "is_latest": False,
                })
        return sorted(versions, key=lambda x: x["last_modified"], reverse=True)
