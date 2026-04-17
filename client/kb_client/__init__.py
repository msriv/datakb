import json
import os
from typing import Any


def _env(key: str, required: bool = False) -> str | None:
    val = os.environ.get(key)
    if required and not val:
        raise EnvironmentError(
            f"[kb_client] Environment variable '{key}' is not set.\n"
            f"Are you running this notebook inside DataKB?\n"
            f"For local development, run: datakb export-env --node <node-title>"
        )
    return val


def _resource_key(name: str | None, default_env: str) -> str:
    if name is None:
        return default_env
    return f"DATAKB_RESOURCE_{name.upper().replace('-', '_').replace(' ', '_')}"


def get_bq(resource_name: str | None = None):
    raise EnvironmentError(
        "[kb_client] get_bq() requires GCP credentials. "
        "This is a v0.1 stub — credentials are not injected until Phase 3."
    )


def get_redis(resource_name: str | None = None):
    raise EnvironmentError(
        "[kb_client] get_redis() requires a running kernel with injected env vars. "
        "This is a v0.1 stub — use inside DataKB after Phase 3."
    )


def get_gcs(resource_name: str | None = None):
    raise EnvironmentError(
        "[kb_client] get_gcs() requires GCP credentials. "
        "This is a v0.1 stub — credentials are not injected until Phase 3."
    )


def get_http(resource_name: str) -> Any:
    key = _resource_key(resource_name, "DATAKB_HTTP")
    base_url = _env(f"{key}_BASE_URL", required=True)
    headers_raw = _env(f"{key}_HEADERS") or "{}"
    auth_type = _env(f"{key}_AUTH_TYPE") or "none"

    import requests  # type: ignore
    session = requests.Session()
    session.headers.update(json.loads(headers_raw))
    if auth_type == "bearer":
        token = _env(f"{key}_TOKEN", required=True)
        session.headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "basic":
        user = _env(f"{key}_USER", required=True)
        password = _env(f"{key}_PASS", required=True)
        session.auth = (user, password)
    orig = session.request
    session.request = lambda method, url, **kw: orig(  # type: ignore
        method, (base_url or "").rstrip("/") + "/" + url.lstrip("/"), **kw
    )
    return session


def get_custom(resource_name: str) -> dict:
    key = _resource_key(resource_name, "DATAKB_CUSTOM")
    raw = _env(f"{key}_CONFIG", required=True)
    return json.loads(raw)  # type: ignore
