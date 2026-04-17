from config import settings
from services.storage.base import StorageBackend
from services.storage.local import LocalAdapter


def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_BACKEND == "local":
        return LocalAdapter(settings.STORAGE_LOCAL_PATH)
    raise NotImplementedError(f"Storage backend '{settings.STORAGE_BACKEND}' not implemented in Phase 1")


_backend: StorageBackend | None = None


def storage() -> StorageBackend:
    global _backend
    if _backend is None:
        _backend = get_storage_backend()
    return _backend
