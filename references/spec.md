# DataKB — Open Source Executable Knowledge Graph
**Specification Document v4.0**
*Status: Final Draft*
*Architecture: Model C — Single container, embedded Jupyter Server*

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem Statement](#2-problem-statement)
3. [Design Decisions Log](#3-design-decisions-log)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [System Architecture](#5-system-architecture)
6. [Component Specifications](#6-component-specifications)
   - 6.1 [Backend API — FastAPI](#61-backend-api--fastapi)
   - 6.2 [Embedded Jupyter Server](#62-embedded-jupyter-server)
   - 6.3 [Storage Backend — Pluggable](#63-storage-backend--pluggable)
   - 6.4 [Metadata Store — SQLite / PostgreSQL](#64-metadata-store--sqlite--postgresql)
   - 6.5 [Frontend — React](#65-frontend--react)
   - 6.6 [kb_client Library](#66-kb_client-library)
7. [GCP Configuration & SA Management](#7-gcp-configuration--sa-management)
8. [Resource Registry](#8-resource-registry)
9. [IAM & Access Model](#9-iam--access-model)
10. [Kernel Session Model](#10-kernel-session-model)
11. [Versioning Model](#11-versioning-model)
12. [Notebook Specification](#12-notebook-specification)
13. [Deployment](#13-deployment)
14. [Database Schema](#14-database-schema)
15. [API Reference](#15-api-reference)
16. [Build Phases](#16-build-phases)
17. [Repository Structure](#17-repository-structure)
18. [Docker Image Specification](#18-docker-image-specification)
19. [First-Run Experience](#19-first-run-experience)
20. [Error Handling & Edge Cases](#20-error-handling--edge-cases)
21. [Frontend Component Tree](#21-frontend-component-tree)
22. [Contributing Guide](#22-contributing-guide)
23. [Open Questions](#23-open-questions)

---

## 1. Overview

**DataKB** is a self-hosted, open source knowledge graph for data engineering teams. Engineers document infrastructure — services, pipelines, databases, Redis instances, GCS buckets, data schemas — as nodes in a visual graph. Each node can have an executable Jupyter notebook attached. The notebook is the documentation: it describes the resource and contains live code any authenticated user can run against real infrastructure, directly from the browser, with no local setup.

The system ships as a **single Docker image**. A team can go from `docker compose up` to a running knowledge graph in under 10 minutes. Notebooks are stored in a pluggable backend — local filesystem for development, GCS or S3 for cloud deployments — switched by a single environment variable. There is no JupyterHub, no Kubernetes requirement, and no separate notebook server to operate.

The **maintainer** configures GCP projects, Service Accounts, and resource connections through the UI. Every other user just logs in, browses the graph, and runs notebooks.

---

## 2. Problem Statement

Data engineering teams accumulate institutional knowledge that is scattered, stale, and inert:

- Wiki pages describe what a Redis instance is but cannot show you what is actually in it right now
- Documentation drifts because updating it is disconnected from the act of using the infrastructure
- New engineers spend days reconstructing what exists and how to interact with it
- Credentials are shared ad-hoc with no audit trail or access boundary

Existing tools solve parts of this: Hex and Deepnote provide executable notebooks but not a knowledge graph view; Obsidian provides graph visualisation but not execution; Confluence provides documentation but it is inert by design. No tool combines all three with a first-class, UI-configurable GCP credential story that works for open source teams.

---

## 3. Design Decisions Log

All decisions locked for v1. Changes require a new spec version.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Execution model | Embedded Jupyter Server (Model C) | Single deployable unit; no JupyterHub ops overhead for open source users |
| 2 | Notebook storage | Pluggable: local filesystem (default) → GCS → S3, switched by env var | UI editing requires cloud-reachable storage; local mode preserves zero-dependency getting started |
| 3 | Versioning | Auto-save every 60s + explicit named snapshots with a message | Belt and suspenders: work is never lost, meaningful checkpoints are explicit |
| 4 | Run access | Anyone authenticated to DataKB can run any notebook | Simplicity; DataKB is an internal trust-boundary tool, not a multi-tenant platform |
| 5 | Kernel sessions | One kernel per user per notebook — isolated sessions | Prevents one user's state (variables, imports) from affecting another's; aligns with how engineers expect notebooks to work |
| 6 | Target deployment | Local (Docker Compose) and cloud (Cloud Run + managed DB) with identical config | Maximises open source adoption; local-first for getting started |
| 7 | Database | SQLite (default, zero config) / PostgreSQL (production), same schema | Solo/local use needs zero external dependencies; team use needs concurrency |
| 8 | Auth | Local username/password OR Google SSO, configured by env var | Works without any GCP connection; Google SSO for teams already on GCP |
| 9 | GCP credentials | SA key file upload OR Workload Identity, configured per SA in the UI | Key file for simplicity and portability; Workload Identity for production GCP deployments |
| 10 | Non-GCP resources | GCP-native (BigQuery, Memorystore, GCS) + generic HTTP/TCP with custom JSON config | Keeps v1 focused while allowing any resource to be connected via the escape hatch |

---

## 4. Goals & Non-Goals

### Goals

- Visual knowledge graph — nodes represent infrastructure units, edges represent relationships
- Executable notebooks attached to nodes — one click from graph to live code in the browser
- Pluggable storage — local filesystem, GCS, or S3, switched by one env var with no code change
- Anyone logged in to DataKB can run any notebook — no per-notebook run permissions
- Maintainer configures all GCP connections (projects, SAs, resources) through the UI
- Per-user kernel isolation — sessions do not share state
- Auto-save every 60 seconds + named snapshots — no work lost, meaningful history preserved
- GCP-native resources out of the box (BigQuery, Cloud Memorystore/Redis, GCS)
- Generic HTTP/TCP resource type for any other connection
- Works offline/locally with no cloud dependencies
- `docker compose up` gets a team running in under 10 minutes
- `kb_client` Python library pre-installed in every kernel — one-line access to any configured resource

### Non-Goals (v1)

- Not a general-purpose notebook platform (not replacing Hex, Deepnote, or Databricks)
- Not a data lineage tool (no column-level tracking)
- No real-time collaborative editing within a single cell (two users editing the same cell simultaneously is not supported)
- No R or Julia kernels (Python only)
- No mobile support
- No AWS or Azure native credential providers (covered by the generic HTTP/TCP type)
- Not a CI/CD or orchestration system

---

## 5. System Architecture

### Single-container layout

```
┌──────────────────────────────────────────────────────────────────┐
│  DataKB Container (port 8000)                                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React Frontend  (static files served by FastAPI at /)    │  │
│  │                                                            │  │
│  │   Graph canvas · Node editor · Notebook editor            │  │
│  │   Settings (GCP config) · Admin (users)                   │  │
│  └───────────────────────┬────────────────────────────────────┘  │
│                          │  HTTP + WebSocket                     │
│  ┌───────────────────────▼────────────────────────────────────┐  │
│  │  FastAPI Backend  (/api/*)                                  │  │
│  │                                                            │  │
│  │  Graph API  ·  Notebook API  ·  Kernel proxy               │  │
│  │  GCP config API  ·  Resource registry  ·  Auth             │  │
│  └───┬──────────────┬───────────────┬──────────────┬──────────┘  │
│      │              │               │              │             │
│  ┌───▼────┐  ┌──────▼──────┐  ┌────▼────┐  ┌─────▼──────────┐  │
│  │SQLite /│  │  Jupyter    │  │Storage  │  │Credential      │  │
│  │Postgres│  │  Server     │  │Backend  │  │Injector        │  │
│  │(graph) │  │  (kernels)  │  │(adapter)│  │(SA → token)    │  │
│  └────────┘  └─────────────┘  └────┬────┘  └────────────────┘  │
│                                    │                             │
└────────────────────────────────────┼─────────────────────────────┘
                                     │
              ┌──────────────────────▼──────────────────────┐
              │  Storage Backend (one of:)                  │
              │                                             │
              │  LocalAdapter  → /content/ on disk          │
              │  GCSAdapter    → gs://bucket/notebooks/     │
              │  S3Adapter     → s3://bucket/notebooks/     │
              └─────────────────────────────────────────────┘
                                     │
              ┌──────────────────────▼──────────────────────┐
              │  GCP Resources (optional)                   │
              │  BigQuery · Memorystore · GCS               │
              │  Generic HTTP/TCP resources                 │
              └─────────────────────────────────────────────┘
```

### Two-container Compose (PostgreSQL, team deployment)

```
┌──────────────────────┐         ┌──────────────────────┐
│  datakb (app)        │────────▶│  PostgreSQL           │
│  (as above)          │         │  (metadata DB only)   │
└──────────────────────┘         └──────────────────────┘
```

Notebooks are never stored in the database. The database stores only graph metadata and pointers to notebook files in the storage backend.

### Full request flow: user opens and runs a notebook

```
1.  User clicks a node in the graph
2.  GET /api/nodes/{id}
    ← node metadata: title, type, notebook_path, gcp_project, sa, resources
3.  GET /api/notebooks/{node_id}
    ← backend fetches .ipynb JSON from storage backend (local/GCS/S3)
    ← returns to frontend for rendering
4.  Frontend renders notebook cells (read-only initially)
5.  User clicks "Start session"
6.  POST /api/kernels  { node_id }
    → backend resolves SA for this node
    → CredentialInjector generates short-lived token + builds env var map
    → Jupyter Server starts a Python kernel with those env vars injected
    ← returns { kernel_id }
7.  Frontend opens WebSocket: /api/kernels/{kernel_id}/channels
    → FastAPI proxies to internal Jupyter Server (validates user token first)
8.  User edits a cell and presses Shift+Enter
    → cell content sent over WebSocket to kernel
    → kernel executes, streams output back
    ← output rendered in cell below
9.  Auto-save fires every 60s:
    → frontend sends current .ipynb JSON to PUT /api/notebooks/{node_id}/autosave
    → backend writes to storage backend, records timestamp in DB
10. User clicks "Save snapshot" with message "Checked key count after deploy"
    → POST /api/notebooks/{node_id}/snapshots  { message }
    → backend writes versioned copy to storage backend, records in snapshots table
```

### Full request flow: maintainer connects a GCP project and SA

```
1.  Settings → GCP Projects → Add Project
    POST /api/gcp/projects  { project_id: "payments-prod", display_name: "Payments Prod" }
    → recorded in gcp_projects table

2.  Settings → Service Accounts → Add SA
    POST /api/gcp/projects/{id}/service-accounts  (multipart form)
    Body: { sa_email, display_name, credential_type: "key_file" }
    File: sa-key.json
    → backend writes key file to SECRETS_DIR/{uuid}.json (mode 0600)
    → records path in service_accounts table (never returns file contents via API)

3.  Settings → Test Connection
    POST /api/gcp/service-accounts/{id}/test
    → backend calls iam.generateAccessToken using the key file
    ← { success: true, token_preview: "ya29.xxx..." } or { error: "Permission denied" }

4.  Settings → Resources → Add Resource
    POST /api/resources
    Body: { name: "payments-redis", type: "redis", sa_id, config: { host, port, tls: true },
            password_secret: "payments-redis-pass" }
    → backend stores config; password stored separately in SECRETS_DIR

5.  Node editor → Execution tab:
    → Select GCP Project: "payments-prod"
    → Select Service Account: "payments-sa@..."
    → Select Resources: ["payments-redis", "payments-bq"]
    → Save
    → node.gcp_project_id and node.sa_id updated in DB
    → node.resource_bindings updated
```

---

## 6. Component Specifications

### 6.1 Backend API — FastAPI

**Language:** Python 3.12
**Framework:** FastAPI, Uvicorn, SQLAlchemy (async), Alembic
**Port:** 8000 (single port for API, WebSocket proxy, and static frontend)

**Module layout:**

```
backend/
├── main.py                      # App factory, mounts static files, starts Jupyter Server
├── config.py                    # Pydantic BaseSettings — all config from env vars
├── auth/
│   ├── middleware.py             # JWT validation on all /api/* routes
│   ├── local.py                  # Username/password → JWT
│   └── google.py                 # Google OAuth → JWT (optional)
├── routers/
│   ├── graph.py                  # /api/nodes, /api/edges
│   ├── notebooks.py              # /api/notebooks — fetch, save, autosave, snapshots
│   ├── kernels.py                # /api/kernels — lifecycle + WebSocket proxy
│   ├── gcp.py                    # /api/gcp — project/SA CRUD, test connection
│   └── resources.py              # /api/resources — resource registry CRUD
├── services/
│   ├── jupyter_manager.py        # Jupyter Server subprocess + kernel lifecycle
│   ├── credential_injector.py   # SA → access token → kernel env vars
│   ├── storage/
│   │   ├── base.py               # StorageBackend abstract base class
│   │   ├── local.py              # LocalAdapter
│   │   ├── gcs.py                # GCSAdapter
│   │   └── s3.py                 # S3Adapter
│   └── versioning.py             # Autosave + snapshot logic
├── db/
│   ├── engine.py                 # Async SQLAlchemy engine (SQLite or PostgreSQL)
│   ├── models.py                 # ORM models
│   └── migrations/               # Alembic versions
└── secrets/                      # SECRETS_DIR default (overridden by env var)
```

**Key config env vars:**

```bash
# Core
DATAKB_SECRET_KEY=<32-byte random hex>     # Required
DATABASE_URL=sqlite+aiosqlite:////data/datakb.db  # default
AUTH_MODE=local                             # 'local' | 'google'

# Storage backend
STORAGE_BACKEND=local                       # 'local' | 'gcs' | 's3'
STORAGE_LOCAL_PATH=/content                 # for local
STORAGE_GCS_BUCKET=my-datakb-bucket        # for gcs
STORAGE_GCS_PREFIX=notebooks/              # for gcs (optional)
STORAGE_S3_BUCKET=my-datakb-bucket         # for s3
STORAGE_S3_PREFIX=notebooks/               # for s3 (optional)
STORAGE_S3_REGION=us-east-1                # for s3

# Secrets directory (SA key files, resource passwords)
SECRETS_DIR=/secrets

# Google auth (if AUTH_MODE=google)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_ALLOWED_DOMAIN=company.com

# Jupyter Server (internal — auto-generated if not set)
JUPYTER_SERVER_TOKEN=<auto>

# Versioning
AUTOSAVE_INTERVAL_SECONDS=60
```

**Kernel WebSocket proxy:**

FastAPI intercepts all WebSocket connections at `/api/kernels/{kernel_id}/channels`, validates the user's JWT, then proxies bidirectionally to the internal Jupyter Server. The Jupyter Server is never exposed on a public port — all traffic goes through port 8000.

```python
@router.websocket("/api/kernels/{kernel_id}/channels")
async def kernel_ws_proxy(
    websocket: WebSocket,
    kernel_id: str,
    user: User = Depends(get_current_user_ws),  # token from query param for WS
):
    # Verify this kernel belongs to this user (kernel_sessions table)
    session = await get_kernel_session(kernel_id, user.id)
    if not session:
        await websocket.close(code=4403)
        return

    jupyter_url = (
        f"ws://127.0.0.1:8888/api/kernels/{kernel_id}/channels"
        f"?token={settings.JUPYTER_SERVER_TOKEN}"
    )
    async with websockets.connect(jupyter_url) as jupyter_ws:
        await asyncio.gather(
            _forward(websocket, jupyter_ws),
            _forward(jupyter_ws, websocket),
        )
```

---

### 6.2 Embedded Jupyter Server

Jupyter Server runs as a subprocess of the FastAPI process, bound to `127.0.0.1:8888`. It is launched at startup and restarted automatically if it crashes.

**Startup:**

```python
# services/jupyter_manager.py
class JupyterManager:
    def start(self):
        cmd = [
            "jupyter", "server",
            "--no-browser",
            "--port=8888",
            "--ip=127.0.0.1",
            f"--ServerApp.token={settings.JUPYTER_SERVER_TOKEN}",
            "--ServerApp.root_dir=/tmp/kernels",   # scratch dir, not content dir
            "--ServerApp.allow_origin=*",
            "--ServerApp.disable_check_xsrf=True",  # XSRF handled by FastAPI proxy
            "--ServerApp.open_browser=False",
        ]
        self.proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    async def start_kernel(self, kernel_id_hint: str, env_vars: dict) -> str:
        """Start a kernel with injected env vars. Returns the kernel_id."""
        resp = await self._jupyter_post("/api/kernels", json={
            "name": "python3",
            "env": env_vars,
        })
        return resp["id"]

    async def stop_kernel(self, kernel_id: str):
        await self._jupyter_delete(f"/api/kernels/{kernel_id}")

    async def list_kernels(self) -> list:
        return await self._jupyter_get("/api/kernels")
```

**Kernel env vars (injected by CredentialInjector):**

Jupyter Server supports passing `env` in the kernel start request. These env vars are available inside the kernel process and readable by `kb_client`. They are not persisted anywhere — they exist only for the lifetime of the kernel process.

**Kernel root dir:**

Jupyter Server's `root_dir` is `/tmp/kernels` — a scratch directory, not the content directory. This means users cannot browse the notebook filesystem through the Jupyter Server's file API. All file operations (open, save, list) go through the FastAPI notebook API, which in turn reads and writes the storage backend. This decoupling is intentional: it prevents the Jupyter file browser from bypassing storage abstraction.

**Kernel idle timeout:**

Kernels with no activity for 30 minutes are automatically shut down via a background task in FastAPI. The user's browser receives a `kernel_dead` event and shows a "Session ended — restart to continue" banner.

---

### 6.3 Storage Backend — Pluggable

The storage backend is an abstract interface with three implementations. Switching between them requires only changing `STORAGE_BACKEND` (and providing the relevant bucket/path config). The rest of the application is unaware of which backend is active.

**Abstract interface:**

```python
# services/storage/base.py
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
```

**LocalAdapter:**

Reads and writes files in `STORAGE_LOCAL_PATH`. Versions are stored as copies:
`{path}.versions/{timestamp}_{snapshot_id}.ipynb`

Auto-save overwrites the main file. Named snapshots write a new versioned copy. Version listing reads the `.versions/` directory.

```python
# services/storage/local.py
class LocalAdapter(StorageBackend):
    def __init__(self, base_path: str):
        self.base = Path(base_path)

    async def read(self, path: str) -> bytes:
        return (self.base / path).read_bytes()

    async def write(self, path: str, content: bytes) -> None:
        full = self.base / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_bytes(content)

    async def read_version(self, path: str, version_id: str) -> bytes:
        version_path = self.base / f"{path}.versions" / version_id
        return version_path.read_bytes()

    async def list_versions(self, path: str) -> list[dict]:
        versions_dir = self.base / f"{path}.versions"
        if not versions_dir.exists():
            return []
        return sorted([
            { "version_id": f.name, "last_modified": f.stat().st_mtime,
              "size": f.stat().st_size }
            for f in versions_dir.iterdir()
        ], key=lambda x: x["last_modified"], reverse=True)
```

**GCSAdapter:**

Uses `google-cloud-storage` async client. Requires GCS object versioning enabled on the bucket (`gsutil versioning set on gs://bucket`). Uses the bucket's native object versioning for `read_version` and `list_versions` — no separate copies needed.

```python
# services/storage/gcs.py
from google.cloud import storage

class GCSAdapter(StorageBackend):
    def __init__(self, bucket_name: str, prefix: str = ""):
        self.client = storage.Client()
        self.bucket = self.client.bucket(bucket_name)
        self.prefix = prefix.rstrip("/") + "/" if prefix else ""

    def _blob(self, path: str):
        return self.bucket.blob(f"{self.prefix}{path}")

    async def read(self, path: str) -> bytes:
        return self._blob(path).download_as_bytes()

    async def write(self, path: str, content: bytes) -> None:
        self._blob(path).upload_from_string(content, content_type="application/json")

    async def list_versions(self, path: str) -> list[dict]:
        blobs = self.client.list_blobs(
            self.bucket, prefix=f"{self.prefix}{path}", versions=True
        )
        return [
            { "version_id": b.generation, "last_modified": b.time_created.isoformat(),
              "size": b.size, "is_latest": not b.time_deleted }
            for b in blobs
        ]

    async def read_version(self, path: str, version_id: str) -> bytes:
        blob = self.bucket.blob(f"{self.prefix}{path}", generation=int(version_id))
        return blob.download_as_bytes()
```

**S3Adapter:**

Uses `aioboto3`. Requires S3 versioning enabled on the bucket. Same interface as GCSAdapter, using S3 version IDs.

---

### 6.4 Metadata Store — SQLite / PostgreSQL

**Engine selection:** Set by `DATABASE_URL`. SQLAlchemy async engine + Alembic migrations. Alembic runs automatically on startup — no manual migration step needed.

**What lives in the DB:** Graph structure (nodes, edges), user accounts, GCP project and SA config (not the key files themselves), resource registry, kernel sessions, snapshot metadata.

**What does NOT live in the DB:** Notebook content (`.ipynb` files — in storage backend), SA key files (in `SECRETS_DIR`), resource passwords (in `SECRETS_DIR`).

**Full schema:**

```sql
-- ─────────────────────────────────
-- GRAPH
-- ─────────────────────────────────

CREATE TABLE nodes (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    type             TEXT NOT NULL,
    -- type: service|pipeline|database|redis|gcs_bucket|schema|note|team
    team             TEXT,
    description      TEXT,
    tags             TEXT NOT NULL DEFAULT '[]',   -- JSON array
    notebook_path    TEXT,             -- relative path in storage backend
    -- GCP execution config (all nullable — node may have no notebook)
    gcp_project_id   TEXT REFERENCES gcp_projects(id) ON DELETE SET NULL,
    sa_id            TEXT REFERENCES service_accounts(id) ON DELETE SET NULL,
    resource_bindings TEXT NOT NULL DEFAULT '[]',  -- JSON array of resource names
    -- Authorship
    created_by       TEXT NOT NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    last_run_at      TEXT,
    last_run_by      TEXT,
    is_archived      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE edges (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    -- label: reads_from|writes_to|depends_on|owns|produces|consumes|triggers
    created_by  TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    UNIQUE (source_id, target_id, label)
);

-- ─────────────────────────────────
-- GCP CONFIG
-- ─────────────────────────────────

CREATE TABLE gcp_projects (
    id           TEXT PRIMARY KEY,
    project_id   TEXT UNIQUE NOT NULL,   -- GCP project ID: "payments-prod"
    display_name TEXT NOT NULL,
    added_by     TEXT NOT NULL,
    added_at     TEXT NOT NULL
);

CREATE TABLE service_accounts (
    id               TEXT PRIMARY KEY,
    gcp_project_id   TEXT NOT NULL REFERENCES gcp_projects(id) ON DELETE CASCADE,
    sa_email         TEXT NOT NULL,
    display_name     TEXT NOT NULL,
    credential_type  TEXT NOT NULL CHECK (credential_type IN ('key_file', 'workload_identity')),
    key_file_ref     TEXT,              -- filename in SECRETS_DIR (not the full path)
    added_by         TEXT NOT NULL,
    added_at         TEXT NOT NULL,
    UNIQUE (gcp_project_id, sa_email)
);

-- ─────────────────────────────────
-- RESOURCE REGISTRY
-- ─────────────────────────────────

CREATE TABLE resources (
    id             TEXT PRIMARY KEY,
    name           TEXT UNIQUE NOT NULL,  -- "payments-redis", "analytics-bq"
    type           TEXT NOT NULL CHECK (type IN ('bigquery', 'redis', 'gcs', 'http', 'tcp', 'custom')),
    display_name   TEXT NOT NULL,
    gcp_project_id TEXT REFERENCES gcp_projects(id) ON DELETE SET NULL,
    sa_id          TEXT REFERENCES service_accounts(id) ON DELETE SET NULL,
    config         TEXT NOT NULL,         -- JSON: type-specific connection config
    password_ref   TEXT,                  -- filename in SECRETS_DIR for passwords
    added_by       TEXT NOT NULL,
    added_at       TEXT NOT NULL
);

-- ─────────────────────────────────
-- USERS & AUTH
-- ─────────────────────────────────

CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    display_name  TEXT,
    role          TEXT NOT NULL DEFAULT 'viewer',  -- admin|editor|viewer
    team          TEXT,
    password_hash TEXT,      -- null if Google auth
    created_at    TEXT NOT NULL,
    last_login_at TEXT
);

-- ─────────────────────────────────
-- KERNEL SESSIONS
-- ─────────────────────────────────

CREATE TABLE kernel_sessions (
    kernel_id    TEXT PRIMARY KEY,       -- Jupyter kernel ID (UUID from Jupyter Server)
    node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at   TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 1,
    UNIQUE (node_id, user_id, is_active)  -- one active kernel per user per notebook
);

-- ─────────────────────────────────
-- VERSIONING
-- ─────────────────────────────────

CREATE TABLE snapshots (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,   -- path in storage backend where this snapshot lives
    message      TEXT NOT NULL,   -- user-provided snapshot message
    created_by   TEXT NOT NULL,
    created_at   TEXT NOT NULL
);

CREATE TABLE autosaves (
    id           TEXT PRIMARY KEY,
    node_id      TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,   -- path of the autosaved file in storage backend
    saved_at     TEXT NOT NULL,
    saved_by     TEXT NOT NULL
);

-- Indexes
CREATE INDEX ON nodes(team);
CREATE INDEX ON nodes(type);
CREATE INDEX ON edges(source_id);
CREATE INDEX ON edges(target_id);
CREATE INDEX ON kernel_sessions(node_id, user_id);
CREATE INDEX ON snapshots(node_id);
```

---

### 6.5 Frontend — React

**Stack:** React 18, TypeScript, React Flow (graph), CodeMirror 6 (cell editor), TailwindCSS, Vite
**Bundled into:** `backend/static/` at build time, served by FastAPI at `/`
**Auth storage:** JWT in memory only (never `localStorage` or `sessionStorage`) — refreshed on tab focus using the refresh token in an `httpOnly` cookie

#### Graph canvas (`/`)

Full-screen React Flow canvas. Node appearance by type:

| Type | Fill | Border | Icon |
|------|------|--------|------|
| `service` | Blue-50 | Blue-300 | ⬡ |
| `pipeline` | Teal-50 | Teal-300 | → |
| `database` | Purple-50 | Purple-300 | ⬢ |
| `redis` | Coral-50 | Coral-300 | ⚡ |
| `gcs_bucket` | Amber-50 | Amber-300 | ▣ |
| `schema` | Gray-50 | Gray-300 | ≡ |
| `note` | White | Gray-200 dashed | ✎ |
| `team` | Green-50 | Green-300 dashed | ⬟ (cluster) |

Node status badges:
- Notebook attached: solid circle indicator
- Active kernels: small animated pulse (N users currently running)

Top bar:
- Search: live filter by title, tag, team — non-matching nodes dim to 15% opacity
- Filter pills: by type, by team
- Layout toggle: force-directed / hierarchical (top-down) / manual (drag to arrange)
- `+ Add node` button — editor/admin only

Click node → right-side detail panel slides in (does not navigate away from graph).

#### Node detail panel

```
┌─────────────────────────────────────────────────────┐
│  [redis]  Auth Service Redis Cache         [× close] │
│  platform  · cache  · auth  · session               │
├─────────────────────────────────────────────────────┤
│  The Redis instance used by the Auth Service to      │
│  cache session tokens. TTL: 24h.                     │
│  Eviction: allkeys-lru. Region: us-central1.         │
├─────────────────────────────────────────────────────┤
│  Execution                                           │
│  GCP Project:  payments-prod                        │
│  Service Acct: platform-sa@payments-prod.iam...     │
│  Resources:    payments-redis                       │
├─────────────────────────────────────────────────────┤
│  Relationships                                       │
│  ← reads_from    Auth Service Pipeline    [→ node]  │
│  → produces      User Sessions Schema     [→ node]  │
├─────────────────────────────────────────────────────┤
│  Last run: 2 hours ago by alice@company.com          │
│  2 active sessions now                              │
│                                                     │
│  [  Open Notebook  ▶  ]    [  Edit node  ]          │
└─────────────────────────────────────────────────────┘
```

#### Notebook editor (`/nodes/{id}/notebook`)

Full-page view replacing the graph (browser back returns to graph).

**Toolbar (top):**
```
[← Graph]  Auth Service Redis  [kernel: ● running / ○ stopped]
[Run ▶] [Run All] [Restart] [Interrupt]    [Save snapshot ↓] [Saved 12s ago]
```

**Cell list:**

Each cell is a stacked pair: editor on top, output below.

- **Code cell editor:** CodeMirror 6 with Python syntax highlighting, autocomplete, bracket matching. Shift+Enter runs the cell. Line numbers shown. Cell execution count `[3]` shown to the left.
- **Output area:** Renders text, DataFrames (scrollable HTML table), matplotlib figures (PNG inline), tracebacks (red-tinted, collapsible).
- **Cell toolbar (on hover):** Run this cell, add cell above, add cell below, move up, move down, change type (code/markdown), delete.

**Read-only mode for viewers:**

The Run button and cell toolbar are hidden. A banner reads: *"You can view this notebook but not run it. Contact an admin to have your role upgraded."* Cell outputs from the last save are shown.

**Session banner:**

```
┌──────────────────────────────────────────────────────────────┐
│  ● Session active — kernel running as platform-sa@...        │
│  Resources: payments-redis                    [End session]  │
└──────────────────────────────────────────────────────────────┘
```

If no session is active:
```
┌──────────────────────────────────────────────────────────────┐
│  ○ No active session                          [Start ▶]      │
└──────────────────────────────────────────────────────────────┘
```

**Version history panel (slide-in from right):**

Triggered by clicking `[History]` in toolbar. Shows:
- Auto-saves: listed by timestamp and user — `[Restore]` button on each
- Named snapshots: listed with message, user, timestamp — `[Restore]` and `[View diff]`

Diff view: side-by-side cell comparison between current notebook and selected version.

#### Node editor (`/nodes/new`, `/nodes/{id}/edit`)

Tab 1 — Metadata:
- Title (required), Type (dropdown), Team (autocomplete), Description (markdown textarea), Tags (tag chips)

Tab 2 — Execution:
- GCP Project (dropdown — lists configured projects, or "No GCP connection")
- Service Account (dropdown filtered to selected project)
- Resources (multi-select checklist of named resources from registry)
- Notebook: Upload `.ipynb` file | Create blank notebook | No notebook

Tab 3 — Relationships:
- Edge table: source node, label, target node
- Add edge: search for any node, select label, save

#### Settings (`/settings`) — admin only

**GCP Projects tab:**
- Table: project ID, display name, SA count, node count, added by, added at
- Add project → modal (project ID, display name)
- Delete project → warning if SAs or nodes reference it

**Service Accounts tab:**
- Filtered by project
- Table: SA email, display name, credential type, key file status, test result, nodes using it
- Add SA → modal: SA email, display name, credential type
  - Key file: file upload widget (drag and drop or browse)
  - Workload Identity: just the SA email
- Test connection button → shows spinner, then ✓ green or ✗ red with error message

**Resources tab:**
- Table: name, type, GCP project, SA, nodes using it
- Add resource → modal with type-specific fields:
  - `bigquery`: project ID, default dataset
  - `redis`: host, port, password (stored in SECRETS_DIR), TLS toggle
  - `gcs`: bucket name
  - `http`: base URL, headers (JSON), auth type (none/bearer/basic)
  - `tcp`: host, port
  - `custom`: name + arbitrary JSON config
- "Copy env var snippet" button → shows what kb_client env vars this resource injects, useful for local development

**Users tab:**
- Table: email, display name, role, team, last login
- Promote/demote role, assign team, deactivate user
- "Invite user" (sends a setup link for local auth mode)

---

### 6.6 `kb_client` Library

Pre-installed in the kernel environment. Reads credentials exclusively from env vars — no network calls at import time or during execution.

**PyPI package:** `datakb-client`
**Source:** `client/` directory in the monorepo, published separately to PyPI
**Pre-installed in:** The DataKB Docker image's Python environment (used by all kernels)

**Usage:**

```python
from kb_client import get_bq, get_redis, get_gcs, get_http, get_custom

# BigQuery — returns google.cloud.bigquery.Client
bq = get_bq()
df = bq.query("SELECT count(*) FROM `project.dataset.table`").to_dataframe()

# Specific named BigQuery resource (if multiple configured)
bq_analytics = get_bq("analytics-bq")

# Redis — returns redis.Redis (decode_responses=True by default)
r = get_redis("payments-redis")
active_sessions = r.dbsize()

# GCS — returns google.cloud.storage.Client
gcs = get_gcs()
bucket = gcs.bucket("raw-events-bucket")

# Generic HTTP resource — returns a requests.Session with auth pre-configured
http = get_http("internal-api")
resp = http.get("/v1/pipeline/status")

# Custom resource — returns the raw config dict
config = get_custom("my-jdbc-connection")
conn_str = config["jdbc_url"]
```

**Implementation:**

```python
# client/kb_client/__init__.py
import os, json
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
    """Builds the env var key prefix for a named or default resource."""
    if name is None:
        return default_env
    return f"DATAKB_RESOURCE_{name.upper().replace('-', '_').replace(' ', '_')}"

def get_bq(resource_name: str = None):
    from google.oauth2.credentials import Credentials
    from google.cloud import bigquery
    key = _resource_key(resource_name, "DATAKB")
    token = _env(f"{key}_ACCESS_TOKEN", required=True)
    project = _env(f"{key}_GCP_PROJECT", required=True)
    return bigquery.Client(project=project, credentials=Credentials(token=token))

def get_redis(resource_name: str = None):
    import redis as redis_lib
    key = _resource_key(resource_name, "DATAKB_DEFAULT_REDIS")
    host = _env(f"{key}_HOST", required=True)
    port = int(_env(f"{key}_PORT") or "6379")
    password = _env(f"{key}_PASS")
    tls = (_env(f"{key}_TLS") or "false").lower() == "true"
    return redis_lib.Redis(host=host, port=port, password=password,
                           ssl=tls, decode_responses=True)

def get_gcs(resource_name: str = None):
    from google.oauth2.credentials import Credentials
    from google.cloud import storage
    key = _resource_key(resource_name, "DATAKB")
    token = _env(f"{key}_ACCESS_TOKEN", required=True)
    return storage.Client(credentials=Credentials(token=token))

def get_http(resource_name: str) -> "requests.Session":
    import requests
    key = _resource_key(resource_name, "DATAKB_HTTP")
    base_url = _env(f"{key}_BASE_URL", required=True)
    headers_raw = _env(f"{key}_HEADERS") or "{}"
    auth_type = _env(f"{key}_AUTH_TYPE") or "none"
    session = requests.Session()
    session.headers.update(json.loads(headers_raw))
    if auth_type == "bearer":
        token = _env(f"{key}_TOKEN", required=True)
        session.headers["Authorization"] = f"Bearer {token}"
    elif auth_type == "basic":
        user = _env(f"{key}_USER", required=True)
        password = _env(f"{key}_PASS", required=True)
        session.auth = (user, password)
    session.base_url = base_url  # type: ignore
    # Patch get/post to prepend base_url
    _orig_request = session.request
    session.request = lambda method, url, **kw: _orig_request(
        method, base_url.rstrip("/") + "/" + url.lstrip("/"), **kw)
    return session

def get_custom(resource_name: str) -> dict:
    key = _resource_key(resource_name, "DATAKB_CUSTOM")
    raw = _env(f"{key}_CONFIG", required=True)
    return json.loads(raw)
```

---

## 7. GCP Configuration & SA Management

### Credential storage

SA key files are stored in `SECRETS_DIR` (default `/secrets`, should be a mounted volume). The filename is a UUID generated at upload time — not the original filename. Only the UUID is stored in the DB. The full path is never returned by the API. The `SECRETS_DIR` directory should be:
- Bind-mounted from the host (not inside the image)
- Read-only from the container's perspective (`ro` mount flag)
- `chmod 700` on the host, key files `chmod 600`

Resource passwords (e.g. Redis auth strings) are stored in `SECRETS_DIR/{uuid}.secret` — plain text files readable only by the container process.

### Token generation

```python
# services/credential_injector.py
import google.auth
import google.oauth2.service_account as sa_module
from google.auth.impersonated_credentials import Credentials as ImpersonatedCredentials

class CredentialInjector:

    def build_kernel_env(self, node: Node) -> dict[str, str]:
        env: dict[str, str] = {}

        # Node-level SA (used for get_bq() / get_gcs() with no resource name)
        if node.sa_id:
            sa = get_sa(node.sa_id)
            token, project = self._get_token_and_project(sa)
            env["DATAKB_ACCESS_TOKEN"] = token
            env["DATAKB_GCP_PROJECT"] = project

        # Per-resource env vars
        for resource_name in node.resource_bindings:
            resource = get_resource(resource_name)
            key = resource_name.upper().replace("-", "_")
            cfg = json.loads(resource.config)

            if resource.type == "redis":
                env[f"DATAKB_RESOURCE_{key}_HOST"] = cfg["host"]
                env[f"DATAKB_RESOURCE_{key}_PORT"] = str(cfg.get("port", 6379))
                env[f"DATAKB_RESOURCE_{key}_TLS"] = str(cfg.get("tls", False)).lower()
                if resource.password_ref:
                    env[f"DATAKB_RESOURCE_{key}_PASS"] = self._read_secret(resource.password_ref)

            elif resource.type == "bigquery":
                if resource.sa_id:
                    res_sa = get_sa(resource.sa_id)
                    res_token, res_project = self._get_token_and_project(res_sa)
                else:
                    res_token, res_project = token, project
                env[f"DATAKB_RESOURCE_{key}_ACCESS_TOKEN"] = res_token
                env[f"DATAKB_RESOURCE_{key}_GCP_PROJECT"] = cfg.get("project", res_project)

            elif resource.type in ("http", "tcp"):
                env[f"DATAKB_RESOURCE_{key}_BASE_URL"] = cfg.get("base_url", "")
                env[f"DATAKB_RESOURCE_{key}_HEADERS"] = json.dumps(cfg.get("headers", {}))
                env[f"DATAKB_RESOURCE_{key}_AUTH_TYPE"] = cfg.get("auth_type", "none")
                if cfg.get("auth_type") == "bearer" and resource.password_ref:
                    env[f"DATAKB_RESOURCE_{key}_TOKEN"] = self._read_secret(resource.password_ref)

            elif resource.type == "custom":
                env[f"DATAKB_RESOURCE_{key}_CONFIG"] = resource.config

        return env

    def _get_token_and_project(self, sa: ServiceAccount) -> tuple[str, str]:
        project = sa.gcp_project.project_id
        if sa.credential_type == "key_file":
            creds = sa_module.Credentials.from_service_account_file(
                os.path.join(settings.SECRETS_DIR, sa.key_file_ref),
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        else:  # workload_identity
            source_creds, _ = google.auth.default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            creds = ImpersonatedCredentials(
                source_credentials=source_creds,
                target_principal=sa.sa_email,
                target_scopes=["https://www.googleapis.com/auth/cloud-platform"],
                lifetime=3600,
            )
        creds.refresh(google.auth.transport.requests.Request())
        return creds.token, project

    def _read_secret(self, ref: str) -> str:
        return open(os.path.join(settings.SECRETS_DIR, ref)).read().strip()
```

---

## 8. Resource Registry

Resources are named, reusable connection configs. A resource can be bound to multiple nodes. When a kernel starts, all resources bound to that node have their env vars injected.

**Resource types and their config schemas:**

```python
# BigQuery
{ "project": "payments-prod", "default_dataset": "analytics" }

# Redis / Memorystore
{ "host": "10.0.0.5", "port": 6379, "tls": true }
# password stored separately as SECRETS_DIR/{password_ref}

# GCS
{ "bucket": "raw-events-datakb", "prefix": "data/" }

# HTTP (generic REST API)
{
    "base_url": "https://internal-api.company.com",
    "headers": { "X-Internal-Key": "injected-at-runtime" },
    "auth_type": "bearer"   # none | bearer | basic
}
# bearer token or basic password stored in SECRETS_DIR/{password_ref}

# TCP (raw TCP connection — config only, kb_client returns dict)
{ "host": "10.0.0.20", "port": 5432 }

# Custom (arbitrary JSON, returned as dict by get_custom())
{ "jdbc_url": "jdbc:postgresql://...", "driver": "org.postgresql.Driver" }
```

---

## 9. IAM & Access Model

### User roles

| Role | Graph | View notebooks | Run notebooks | Edit nodes | GCP/SA config | Users |
|------|-------|---------------|--------------|-----------|--------------|-------|
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `editor` | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `viewer` | ✓ | ✓ (outputs only) | ✗ | ✗ | ✗ | ✗ |

Run access is not per-node — it is determined entirely by role. Any `editor` or `admin` can run any notebook. `viewer` accounts can only see the graph and read static notebook outputs (the outputs saved in the `.ipynb` file at last save time).

This means the DataKB authentication boundary is the run boundary. If you can log in as an `editor`, you can run any notebook. Grant the `editor` role only to engineers who should have broad execution access.

### GCP security properties

1. **SA key files never leave the server.** The API never returns key file contents. The UI never displays them. The only write path is upload; the only read path is internal credential injection.
2. **Access tokens are scoped to 1 hour.** Tokens generated by `CredentialInjector` are injected as kernel env vars and have a 1-hour lifetime. If a kernel runs beyond 1 hour, `kb_client` will get a token expiry error on the next GCP call. (Token refresh is a known limitation tracked in [Open Questions](#17-open-questions).)
3. **SA capabilities are bounded by GCP IAM.** DataKB does not grant GCP permissions — it only provides access to what the SA already has. A SA that only has `roles/bigquery.dataViewer` cannot write to BigQuery regardless of what a user attempts in a notebook.
4. **Kernel env vars are process-local.** Env vars injected into a kernel process are not accessible by other kernel processes, not persisted in the DB, and not written to the `.ipynb` file.

---

## 10. Kernel Session Model

**One kernel per user per notebook.** If user A and user B both open the "Auth Redis" notebook, they each get their own kernel with their own Python state. Variables set in user A's session do not affect user B's session.

**Kernel identity:** Each kernel is keyed by `(node_id, user_id)`. The `kernel_sessions` table enforces a `UNIQUE (node_id, user_id, is_active)` constraint — starting a second session for the same user+node kills the first.

**Credentials are per-session, not per-user.** When a kernel starts, `CredentialInjector` runs, generating a fresh access token for the node's configured SA. This token is the same regardless of which user starts the kernel — it reflects the SA's permissions, not the user's. The user's identity is used only to look up whether they have the `editor` or `admin` role.

**Lifecycle:**

```
User clicks "Start session"
    → POST /api/kernels { node_id }
    → Check: user.role in (editor, admin) — else 403
    → Kill existing active kernel for this (node_id, user_id) if any
    → CredentialInjector.build_kernel_env(node)
    → Jupyter Server: POST /api/kernels { name: "python3", env: {...} }
    → Insert into kernel_sessions
    → Return kernel_id to frontend

User is idle for 30 minutes
    → Background task detects last_active_at + 30min < now
    → Jupyter Server: DELETE /api/kernels/{kernel_id}
    → Update kernel_sessions: is_active = 0
    → Frontend receives kernel_dead event, shows "Session ended" banner

User clicks "End session"
    → DELETE /api/kernels/{kernel_id}
    → Same cleanup as idle timeout
```

**Active session indicator:** The `kernel_sessions` table is read by the graph endpoint to show how many active kernels exist per node. This drives the animated pulse indicator on nodes in the graph canvas.

---

## 11. Versioning Model

Two mechanisms, both automatic. Users never need to think about saving — their work is never lost.

### Auto-save (every 60 seconds)

The frontend sends the current notebook state to the backend every 60 seconds while a session is active. This is a lightweight upsert — the storage backend overwrites the main `.ipynb` file and the `autosaves` table records the timestamp.

```
Frontend timer fires (60s interval, only when session active and notebook dirty)
    → PUT /api/notebooks/{node_id}/autosave { content: <ipynb JSON> }
    → StorageBackend.write(node.notebook_path, content)
    → Upsert autosaves table: { node_id, storage_path, saved_at, saved_by }
    → Response: { saved_at: "2026-04-17T14:32:11Z" }
    ← Frontend toolbar shows "Saved 0s ago"
```

The auto-save path is the same as the main notebook path — the storage backend's native versioning (GCS object versioning, S3 versioning) automatically retains the previous version. In local mode, a copy is written to `.versions/autosave_{timestamp}.ipynb`.

### Named snapshots (explicit, user-initiated)

When a user clicks "Save snapshot" and provides a message, a separate copy of the current notebook is written to the storage backend and recorded in the `snapshots` table.

```
User types snapshot message and clicks Save
    → POST /api/notebooks/{node_id}/snapshots { message, content: <ipynb JSON> }
    → storage_path = "{node.notebook_path}.snapshots/{snapshot_id}.ipynb"
    → StorageBackend.write(storage_path, content)
    → Insert into snapshots: { id, node_id, storage_path, message, created_by, created_at }
    → Response: snapshot record
    ← Frontend shows "Snapshot saved: <message>"
```

### Version history and restore

The history panel in the notebook editor shows:
1. Named snapshots (from `snapshots` table) — with message, author, timestamp
2. Auto-save history (from storage backend's native version list) — timestamp and author

Restore:
```
User clicks Restore on a version
    → GET /api/notebooks/{node_id}/versions/{version_id}
    → StorageBackend.read_version(path, version_id)
    ← Returns the historical .ipynb JSON
    → Frontend loads it into the editor (does not auto-save immediately)
    → User sees the restored content with a banner: "Restored from version X — save a snapshot to keep this"
```

---

## 12. Notebook Specification

### Metadata cell

The first cell of every notebook should be a `raw` cell containing a YAML block. DataKB reads this on save to auto-update the node's metadata in the DB.

```yaml
# datakb
title: "Auth Service Redis Cache"
type: redis
team: platform
description: |
  The Redis instance used by the Auth Service to cache session tokens.
  TTL: 24 hours. Eviction: allkeys-lru.
  Hosted on GCP Memorystore, us-central1.
tags:
  - redis
  - cache
  - auth
  - session
links:
  - target: "Auth Service Pipeline"
    edge: reads_from
  - target: "User Sessions Schema"
    edge: produces
```

If the metadata cell is absent or malformed, a yellow warning banner appears in the notebook editor: *"Metadata cell missing or invalid — graph node not synced. Add a metadata cell to the first position to keep node metadata up to date."* The notebook still functions normally.

### Recommended cell structure

```
Cell 1  [raw]      Metadata YAML (see above)
Cell 2  [markdown] # Title + short description
Cell 3  [markdown] ## Setup
Cell 4  [code]     Imports + kb_client initialisation
Cell 5  [markdown] ## Inspect
Cell 6  [code]     Safe read-only queries
Cell 7  [markdown] ## Debug
Cell 8  [code]     More invasive diagnostic queries
Cell 9  [markdown] ## ⚠️ Admin — Read carefully before running
Cell 10 [code]     Write/delete operations (commented out by default)
```

---

## 13. Deployment

### Local — zero dependencies (SQLite, local storage)

```yaml
# docker-compose.yml
version: "3.9"
services:
  datakb:
    image: ghcr.io/datakb/datakb:latest
    ports:
      - "8000:8000"
    environment:
      DATAKB_SECRET_KEY: "change-me-in-production-use-openssl-rand-hex-32"
      AUTH_MODE: local
      DATABASE_URL: "sqlite+aiosqlite:////data/datakb.db"
      STORAGE_BACKEND: local
      STORAGE_LOCAL_PATH: /content
      SECRETS_DIR: /secrets
    volumes:
      - ./content:/content     # notebook storage
      - ./data:/data           # SQLite database
      - ./secrets:/secrets:ro  # SA key files (optional, needed only for GCP)
```

```bash
docker compose up
# Open http://localhost:8000
# First run: wizard creates admin account, optionally loads example nodes
```

### Team — PostgreSQL + GCS storage

```yaml
# docker-compose.prod.yml
version: "3.9"
services:
  datakb:
    image: ghcr.io/datakb/datakb:latest
    ports:
      - "8000:8000"
    environment:
      DATAKB_SECRET_KEY: "${DATAKB_SECRET_KEY}"
      AUTH_MODE: google
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}"
      GOOGLE_ALLOWED_DOMAIN: "${GOOGLE_ALLOWED_DOMAIN}"
      DATABASE_URL: "postgresql+asyncpg://datakb:${DB_PASS}@db:5432/datakb"
      STORAGE_BACKEND: gcs
      STORAGE_GCS_BUCKET: "${GCS_BUCKET}"
      STORAGE_GCS_PREFIX: "notebooks/"
      SECRETS_DIR: /secrets
    volumes:
      - ./secrets:/secrets:ro
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: datakb
      POSTGRES_USER: datakb
      POSTGRES_PASSWORD: "${DB_PASS}"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U datakb"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
```

### Cloud — GCP Cloud Run + Cloud SQL + GCS

```bash
# Build and push
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/PROJECT/datakb/app:latest

# Create Cloud SQL (PostgreSQL 16)
gcloud sql instances create datakb \
  --database-version=POSTGRES_16 --tier=db-f1-micro \
  --region=us-central1 --no-assign-ip \
  --network=default

gcloud sql databases create datakb --instance=datakb
gcloud sql users create datakb --instance=datakb --password="${DB_PASS}"

# Create GCS bucket with versioning
gsutil mb -l us-central1 gs://${GCS_BUCKET}
gsutil versioning set on gs://${GCS_BUCKET}

# Store secrets in Secret Manager
echo -n "${DATAKB_SECRET_KEY}" | gcloud secrets create datakb-secret-key --data-file=-
echo -n "${DB_PASS}"           | gcloud secrets create datakb-db-pass --data-file=-

# Deploy to Cloud Run
gcloud run deploy datakb \
  --image us-central1-docker.pkg.dev/PROJECT/datakb/app:latest \
  --region us-central1 \
  --min-instances 1 \
  --max-instances 1 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars "AUTH_MODE=google,GOOGLE_ALLOWED_DOMAIN=company.com" \
  --set-env-vars "STORAGE_BACKEND=gcs,STORAGE_GCS_BUCKET=${GCS_BUCKET}" \
  --set-env-vars "DATABASE_URL=postgresql+asyncpg://datakb:${DB_PASS}@/datakb?host=/cloudsql/PROJECT:us-central1:datakb" \
  --set-secrets "DATAKB_SECRET_KEY=datakb-secret-key:latest" \
  --set-secrets "GOOGLE_CLIENT_ID=datakb-google-client-id:latest" \
  --set-secrets "GOOGLE_CLIENT_SECRET=datakb-google-client-secret:latest" \
  --add-volume "name=secrets,type=secret,secret=datakb-sa-keys" \
  --add-volume-mount "volume=secrets,mount-path=/secrets" \
  --service-account "datakb-sa@PROJECT.iam.gserviceaccount.com" \
  --add-cloudsql-instances PROJECT:us-central1:datakb
```

> **Note on Cloud Run and kernels:** Cloud Run is stateless and can scale horizontally. Jupyter kernels live in-process and cannot be shared across instances. For v1, set `--max-instances 1`. This is a known limitation documented in [Open Questions](#17-open-questions). A multi-instance architecture using a separate kernel service is tracked as a future improvement.

### Environment variable reference

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATAKB_SECRET_KEY` | — | Yes | JWT signing key (`openssl rand -hex 32`) |
| `DATABASE_URL` | `sqlite+aiosqlite:////data/datakb.db` | No | SQLAlchemy async URL |
| `AUTH_MODE` | `local` | No | `local` or `google` |
| `GOOGLE_CLIENT_ID` | — | If google | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | — | If google | OAuth 2.0 client secret |
| `GOOGLE_ALLOWED_DOMAIN` | — | No | Restrict Google auth to one domain |
| `STORAGE_BACKEND` | `local` | No | `local`, `gcs`, or `s3` |
| `STORAGE_LOCAL_PATH` | `/content` | No | Base path for local storage |
| `STORAGE_GCS_BUCKET` | — | If gcs | GCS bucket name |
| `STORAGE_GCS_PREFIX` | `notebooks/` | No | Key prefix within bucket |
| `STORAGE_S3_BUCKET` | — | If s3 | S3 bucket name |
| `STORAGE_S3_PREFIX` | `notebooks/` | No | Key prefix within bucket |
| `STORAGE_S3_REGION` | `us-east-1` | No | AWS region |
| `SECRETS_DIR` | `/secrets` | No | Directory for SA keys and resource passwords |
| `AUTOSAVE_INTERVAL_SECONDS` | `60` | No | Frontend auto-save interval hint |
| `KERNEL_IDLE_TIMEOUT_MINUTES` | `30` | No | Idle kernel shutdown threshold |
| `JUPYTER_SERVER_TOKEN` | auto-generated | No | Internal Jupyter Server auth token |
| `LOG_LEVEL` | `INFO` | No | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

---

## 15. API Reference

All `/api/*` endpoints (except `/api/auth/login`, `/api/auth/google`, `/api/health`) require:
```
Authorization: Bearer <JWT>
```

### Auth

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Local login → JWT + refresh cookie |
| `GET` | `/api/auth/google` | — | Initiate Google OAuth |
| `GET` | `/api/auth/callback` | — | Google OAuth callback |
| `POST` | `/api/auth/refresh` | — | Refresh JWT using httpOnly cookie |
| `GET` | `/api/auth/me` | any | Current user info |

### Graph

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `GET` | `/api/graph` | any | All nodes + edges |
| `GET` | `/api/nodes/{id}` | any | Single node |
| `POST` | `/api/nodes` | editor | Create node |
| `PUT` | `/api/nodes/{id}` | editor | Update node metadata |
| `DELETE` | `/api/nodes/{id}` | editor | Soft-delete node |
| `POST` | `/api/edges` | editor | Create edge |
| `DELETE` | `/api/edges/{id}` | editor | Delete edge |

### Notebooks

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `GET` | `/api/notebooks/{node_id}` | any | Fetch .ipynb JSON from storage |
| `PUT` | `/api/notebooks/{node_id}/autosave` | editor | Auto-save (overwrites main file) |
| `POST` | `/api/notebooks/{node_id}/snapshots` | editor | Create named snapshot |
| `GET` | `/api/notebooks/{node_id}/snapshots` | any | List snapshots |
| `GET` | `/api/notebooks/{node_id}/versions` | any | List all versions (autosave + snapshots) |
| `GET` | `/api/notebooks/{node_id}/versions/{vid}` | any | Fetch a historical version |
| `POST` | `/api/notebooks/{node_id}/restore/{vid}` | editor | Restore version (auto-saves as new version) |

### Kernels

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `POST` | `/api/kernels` | editor | Start kernel for a node |
| `DELETE` | `/api/kernels/{kernel_id}` | editor | Stop kernel |
| `GET` | `/api/kernels/{kernel_id}` | editor | Kernel status |
| `WS` | `/api/kernels/{kernel_id}/channels` | editor | Proxied Jupyter WebSocket |

### GCP Config — admin only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/gcp/projects` | List GCP projects |
| `POST` | `/api/gcp/projects` | Add GCP project |
| `DELETE` | `/api/gcp/projects/{id}` | Remove GCP project |
| `GET` | `/api/gcp/projects/{id}/service-accounts` | List SAs |
| `POST` | `/api/gcp/projects/{id}/service-accounts` | Add SA (multipart: JSON + key file) |
| `DELETE` | `/api/gcp/service-accounts/{id}` | Remove SA |
| `POST` | `/api/gcp/service-accounts/{id}/test` | Test SA → generate token |

### Resources — admin only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/resources` | List resources |
| `POST` | `/api/resources` | Add resource |
| `PUT` | `/api/resources/{id}` | Update resource |
| `DELETE` | `/api/resources/{id}` | Delete resource |

### Users — admin only

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List users |
| `PUT` | `/api/users/{id}` | Update role/team/active status |
| `POST` | `/api/users/invite` | Send invite (local auth mode) |

---

## 16. Build Phases

### Phase 1 — Graph core (weeks 1–3)

**Goal:** Running graph with real data, deployed locally via Docker Compose.

- Monorepo setup: `backend/`, `frontend/`, `client/`, `deploy/`, `examples/`
- FastAPI: SQLAlchemy models, Alembic migrations, graph CRUD endpoints, local auth
- React: graph canvas (React Flow), node detail panel, node editor (metadata tab only)
- StorageBackend abstract class + LocalAdapter
- Docker image + `docker-compose.yml`
- First-run wizard (create admin, optionally load example nodes)
- CI: lint (ruff, mypy, eslint), unit tests, Docker build check

**Success criteria:** `docker compose up` → create nodes and edges in the UI → graph renders and is navigable → node detail panel shows all metadata.

---

### Phase 2 — Notebook editor (weeks 4–6)

**Goal:** Click a node, edit a notebook, save it — all in the browser.

- Jupyter Server subprocess management in FastAPI
- Notebook fetch/save via StorageBackend (LocalAdapter)
- WebSocket proxy (kernel channels)
- React: embedded notebook editor (CodeMirror cells, output rendering: text, DataFrame, PNG)
- Read-only notebook view for `viewer` role
- Kernel start/stop UI, session status banner
- Auto-save (60s) + named snapshots + version history panel
- `kb_client` v0.1.0 (env var reads only, no actual GCP calls needed yet)
- Pre-installed in Docker image kernel environment

**Success criteria:** Open a node → start a session → write Python → run cell → see output → auto-save fires → open history panel → restore a past version.

---

### Phase 3 — GCP config + credential injection (weeks 7–9)

**Goal:** Notebooks connect to real GCP resources via `kb_client` with credentials managed in the UI.

- GCP Projects / Service Accounts UI in Settings
- SA key file upload, storage in `SECRETS_DIR`, test-connection endpoint
- Workload Identity support
- Resource registry UI (BigQuery, Redis, GCS, HTTP, custom)
- `CredentialInjector` — token generation + env var map
- Kernel start updated to inject credentials
- `kb_client` v0.2.0 — `get_bq()`, `get_redis()`, `get_gcs()`, `get_http()`, `get_custom()`
- Published to PyPI as `datakb-client`
- `datakb export-env` CLI (for local development outside DataKB)

**Success criteria:** Maintainer adds GCP project, uploads SA key, adds Redis resource, binds to a node → developer opens notebook, runs `get_redis("payments-redis")`, gets a live Redis client connected to the real instance.

---

### Phase 4 — Storage backends + open source launch (weeks 10–12)

**Goal:** GCS and S3 storage adapters working; public GitHub release.

- GCSAdapter (with native object versioning)
- S3Adapter (with S3 versioning)
- Storage backend switching via env var — full integration tests for all three
- Google OAuth auth mode
- Example notebooks (5 pre-built): BigQuery table health check, Redis inspector, GCS bucket browser, pipeline run history, schema explorer
- Comprehensive README + getting started guide (local, GCP Cloud Run, AWS)
- Contributing guide + plugin interface documentation (how to add a storage adapter, how to add a resource type)
- GitHub Actions CI: test all three storage backends, publish Docker image to GHCR, publish `datakb-client` to PyPI on tag

**Success criteria:** GHCR image pulls, runs locally, connects to GCS in cloud mode; `datakb-client` installs from PyPI; 5 example notebooks work out of the box.

---

## 23. Open Questions

| # | Question | Impact | Notes |
|---|----------|--------|-------|
| 1 | **Project / package name** | High — must be unique on PyPI and GitHub before Phase 1 | Candidates: `datakb`, `graphbook`, `kbflow`, `notegraph`, `nbkb`. Check PyPI and GitHub availability. |
| 2 | **Cloud Run multi-instance kernel problem** | High for production GCP deployments | Kernels are in-process. `--max-instances 1` is acceptable for v1 but limits scalability. Long-term options: (a) separate kernel service with sticky routing; (b) Cloud Run Jobs per kernel; (c) document that GKE is preferred for >10 concurrent users. |
| 3 | **Access token refresh inside long-running kernels** | Medium | 1-hour tokens expire mid-run for long cells. Options: (a) `kb_client` re-requests a token via a local FastAPI endpoint before each call; (b) background thread in the kernel refreshes every 45 minutes. Option (a) is simpler but requires a round-trip per call. |
| 4 | **S3 credentials for S3Adapter** | Medium | S3 adapter needs AWS credentials. Options: (a) env vars (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`); (b) EC2 instance profile / ECS task role (auto-detected by boto3). Document both. |
| 5 | **Notebook output size** | Low for now, high at scale | Cell outputs (especially DataFrames and plots) are stored in the `.ipynb` file in the storage backend. A notebook with large outputs can easily reach 10–50MB. Mitigation options: strip outputs on auto-save (user can always re-run), or set a max output size per cell. |
| 6 | **Concurrent edits to the same notebook** | Low — rare but possible | Two editors with active sessions on the same notebook will both auto-save. Last-write-wins — no merge. V1 mitigation: show a warning banner if a save would overwrite a newer version ("This notebook was saved by bob@co.com 30 seconds ago. Your save will overwrite their changes. Proceed?"). |
| 7 | **Audit log** | Low for v1, high for compliance-conscious users | The schema should include an `audit_log` table from day one (event type, user, node, timestamp, details JSON) even if it's not surfaced in the UI in v1. Retrofitting audit logging later requires a schema migration and code changes across every operation. |
| 8 | **Plugin interface for resource types** | Medium for open source adoption | Contributors will want to add Snowflake, Databricks, AWS Redshift, etc. The `resources` table `type` column is currently an enum. Before v1 ships, decide: (a) open enum (any string allowed, UI shows generic config JSON editor for unknown types); (b) plugin registry where contributors register a resource type with a schema and a `kb_client` helper. Option (b) is better long-term but needs design. |

---

*End of specification. DataKB v3.0.*
*Next step: Phase 1 — monorepo setup and graph CRUD backend.*

---

## 17. Repository Structure

DataKB is a monorepo. All packages — backend, frontend, client library, deployment config, and documentation — live in one repository. This simplifies contributor onboarding (one clone, one set of tools), keeps issues and PRs in one place, and makes it easy to ensure the `kb_client` version shipped inside the Docker image always matches the backend's API version.

```
datakb/
│
├── backend/                        # FastAPI application
│   ├── main.py                     # App factory, lifespan hooks
│   ├── config.py                   # Pydantic BaseSettings
│   ├── auth/
│   │   ├── middleware.py
│   │   ├── local.py
│   │   └── google.py
│   ├── routers/
│   │   ├── graph.py
│   │   ├── notebooks.py
│   │   ├── kernels.py
│   │   ├── gcp.py
│   │   └── resources.py
│   ├── services/
│   │   ├── jupyter_manager.py
│   │   ├── credential_injector.py
│   │   ├── versioning.py
│   │   └── storage/
│   │       ├── base.py
│   │       ├── local.py
│   │       ├── gcs.py
│   │       └── s3.py
│   ├── db/
│   │   ├── engine.py
│   │   ├── models.py
│   │   └── migrations/
│   │       ├── env.py
│   │       └── versions/
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_graph.py
│   │   ├── test_notebooks.py
│   │   ├── test_kernels.py
│   │   ├── test_storage_local.py
│   │   ├── test_storage_gcs.py      # skipped unless GCS_TEST_BUCKET set
│   │   └── test_storage_s3.py       # skipped unless S3_TEST_BUCKET set
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/                        # React application
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── graph/
│   │   │   ├── notebook/
│   │   │   ├── node-editor/
│   │   │   └── settings/
│   │   ├── hooks/
│   │   ├── stores/                  # Zustand state stores
│   │   ├── api/                     # Generated API client (openapi-typescript)
│   │   └── types/
│   ├── public/
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── client/                          # datakb-client Python library
│   ├── kb_client/
│   │   ├── __init__.py              # get_bq, get_redis, get_gcs, get_http, get_custom
│   │   └── cli.py                   # datakb export-env CLI
│   ├── tests/
│   ├── pyproject.toml
│   └── README.md
│
├── deploy/
│   ├── docker-compose.yml           # local dev (SQLite + local storage)
│   ├── docker-compose.prod.yml      # team (PostgreSQL + GCS)
│   ├── nginx/
│   │   └── datakb.conf              # reverse proxy config
│   ├── gcp/
│   │   ├── cloudrun.sh              # Cloud Run deploy script
│   │   └── terraform/               # optional IaC for full GCP setup
│   └── k8s/                         # Helm chart (Phase 4 bonus)
│       └── helm/
│
├── examples/                        # Pre-built example notebooks
│   ├── bigquery-table-health.ipynb
│   ├── redis-inspector.ipynb
│   ├── gcs-bucket-browser.ipynb
│   ├── pipeline-run-history.ipynb
│   └── schema-explorer.ipynb
│
├── docs/                            # Documentation site source (MkDocs)
│   ├── index.md
│   ├── getting-started.md
│   ├── configuration.md
│   ├── gcp-setup.md
│   ├── writing-notebooks.md
│   ├── storage-backends.md
│   ├── contributing/
│   │   ├── development-setup.md
│   │   ├── adding-storage-adapter.md
│   │   └── adding-resource-type.md
│   └── mkdocs.yml
│
├── Dockerfile
├── .dockerignore
├── Makefile                         # Dev shortcuts: make dev, make test, make build
├── .github/
│   └── workflows/
│       ├── ci.yml                   # lint + test on every PR
│       ├── docker.yml               # build + push to GHCR on main merge
│       └── publish-client.yml       # publish datakb-client to PyPI on tag
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                          # Apache 2.0
└── README.md
```

### Key conventions

**Single source of truth for API types.** The FastAPI app auto-generates an OpenAPI schema at `/openapi.json`. The frontend uses `openapi-typescript` in CI to generate a typed API client from this schema into `frontend/src/api/`. This means the backend and frontend types are always in sync — a breaking API change fails the frontend type check immediately.

**Shared version pinning.** The `kb_client` version installed inside the Docker image is pinned to the exact same git commit as the backend. This is enforced in the Dockerfile — the client is installed from the local `client/` directory, not from PyPI, during the image build. PyPI releases happen separately and are for users who want to use `kb_client` locally outside DataKB.

**Makefile as the developer interface.** Contributors should not need to memorise docker, uvicorn, or vite commands. The Makefile provides:

```makefile
make dev          # start backend + frontend in watch mode (no Docker)
make dev-docker   # start full stack via docker compose
make test         # run all backend tests
make test-fe      # run frontend tests
make lint         # ruff + mypy + eslint
make build        # build Docker image
make db-migrate   # run Alembic migrations
make db-reset     # drop and recreate dev database
make gen-api      # regenerate frontend API client from OpenAPI schema
```

---

## 18. Docker Image Specification

### Build strategy

The Docker image uses a **multi-stage build** to keep the final image small and to separate the Python application environment from the Python kernel environment. These are two distinct environments with different dependency sets:

- **App environment:** FastAPI, SQLAlchemy, google-cloud-*, storage adapters. Should be lean.
- **Kernel environment:** All the packages a notebook author might use — pandas, numpy, matplotlib, scikit-learn, bigquery, redis-py, google-cloud-*. Can be larger — this is what runs user code.

```dockerfile
# ─────────────────────────────────────────────
# Stage 1: Build frontend
# ─────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build
# Output: /app/frontend/dist/

# ─────────────────────────────────────────────
# Stage 2: Build kernel Python environment
# (separate venv — heavier, user-facing)
# ─────────────────────────────────────────────
FROM python:3.12-slim AS kernel-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ git curl \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /kernel-env
ENV PATH="/kernel-env/bin:$PATH"

# Jupyter Server + kernel packages
RUN pip install --no-cache-dir \
    jupyter-server==2.* \
    ipykernel \
    pandas \
    numpy \
    matplotlib \
    pyarrow \
    google-cloud-bigquery[pandas] \
    google-cloud-storage \
    redis \
    requests \
    httpx

# Install kb_client from local source
COPY client/ /tmp/client/
RUN pip install --no-cache-dir /tmp/client/

# Register the kernel
RUN python -m ipykernel install --prefix=/kernel-env --name python3 --display-name "Python 3 (DataKB)"

# ─────────────────────────────────────────────
# Stage 3: Build app Python environment
# (lean — only what FastAPI needs)
# ─────────────────────────────────────────────
FROM python:3.12-slim AS app-builder

RUN python -m venv /app-env
ENV PATH="/app-env/bin:$PATH"

COPY backend/requirements.txt /tmp/
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# ─────────────────────────────────────────────
# Stage 4: Final image
# ─────────────────────────────────────────────
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy both Python environments
COPY --from=kernel-builder /kernel-env /kernel-env
COPY --from=app-builder /app-env /app-env

# Copy application code
COPY backend/ /app/backend/
COPY --from=frontend-builder /app/frontend/dist/ /app/backend/static/

WORKDIR /app/backend

# App uses its own env; kernel uses /kernel-env
# The app launches Jupyter Server pointing at /kernel-env/bin/jupyter
ENV PATH="/app-env/bin:$PATH"
ENV KERNEL_PYTHON="/kernel-env/bin/python"
ENV JUPYTER_BIN="/kernel-env/bin/jupyter"

# Runtime directories (should be mounted as volumes in production)
RUN mkdir -p /content /secrets /data
VOLUME ["/content", "/secrets", "/data"]

EXPOSE 8000

# Run Alembic migrations then start app
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
```

### Image layers and caching

The layer order is intentional for build cache efficiency:
1. Node modules (`npm ci`) — changes only when `package.json` changes
2. Kernel Python packages — changes only when kernel `requirements.txt` changes
3. App Python packages — changes only when `requirements.txt` changes
4. Frontend source build — changes on any frontend code change
5. Backend source — changes most frequently, placed last

### Sizes (approximate)

| Layer | Approximate size |
|-------|-----------------|
| Base Python 3.12-slim | ~130 MB |
| App Python environment | ~80 MB |
| Kernel Python environment (with data science libs) | ~600 MB |
| Frontend static files | ~5 MB |
| Backend source code | ~1 MB |
| **Total compressed image** | **~450 MB** |

### Jupyter Server configuration

The app starts Jupyter Server using the `/kernel-env/bin/jupyter` binary, pointing it at the kernel environment. This is set via `JUPYTER_BIN` env var and used in `jupyter_manager.py`:

```python
JUPYTER_BIN = os.environ.get("JUPYTER_BIN", "jupyter")

subprocess.Popen([
    JUPYTER_BIN, "server",
    "--no-browser",
    "--port=8888",
    "--ip=127.0.0.1",
    f"--ServerApp.token={settings.JUPYTER_SERVER_TOKEN}",
    "--ServerApp.root_dir=/tmp/kernels",
    ...
])
```

### Image tags and versioning

```
ghcr.io/datakb/datakb:latest        # latest stable release
ghcr.io/datakb/datakb:1.0.0         # specific release
ghcr.io/datakb/datakb:sha-abc123    # specific commit (for testing)
```

Tags are pushed by GitHub Actions on:
- Every merge to `main` → updates `sha-{short_sha}`
- Every version tag (`v1.0.0`) → updates `1.0.0` and `latest`

---

## 19. First-Run Experience

When DataKB starts and the database has no users, it enters **first-run mode**. The backend detects this at startup and sets a flag (`FIRST_RUN=true` in an in-memory flag, not an env var). Any request to the frontend while this flag is set redirects to `/setup`.

### Setup wizard — 4 steps

#### Step 1: Welcome

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   ◈  DataKB                                                  │
│                                                              │
│   Welcome. Let's get your knowledge graph set up.           │
│   This takes about 2 minutes.                               │
│                                                              │
│   [ Get started → ]                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### Step 2: Create admin account

```
┌──────────────────────────────────────────────────────────────┐
│  Create your admin account                                   │
│                                                              │
│  Email          [alice@company.com              ]            │
│  Display name   [Alice                          ]            │
│  Password       [••••••••••••••                 ]            │
│  Confirm        [••••••••••••••                 ]            │
│                                                              │
│  This account will have full admin access.                   │
│  You can add more users after setup.                         │
│                                                              │
│  [ ← Back ]                          [ Create account → ]   │
└──────────────────────────────────────────────────────────────┘
```

#### Step 3: Load example data (optional)

```
┌──────────────────────────────────────────────────────────────┐
│  Load example knowledge graph?                               │
│                                                              │
│  We can populate your graph with example nodes and           │
│  notebooks to help you get started:                          │
│                                                              │
│  ◉  Yes — load 5 example nodes and notebooks                 │
│     (BigQuery health check, Redis inspector, and more)       │
│                                                              │
│  ○  No — start with an empty graph                           │
│                                                              │
│  You can delete the examples any time.                       │
│                                                              │
│  [ ← Back ]                             [ Continue → ]      │
└──────────────────────────────────────────────────────────────┘
```

If "Yes" is selected, the backend:
1. Copies the 5 example `.ipynb` files from `/app/examples/` to the storage backend
2. Creates the corresponding nodes in the DB
3. Creates edges between them (the examples form a small connected graph)

The example nodes are:

| Title | Type | Demonstrates |
|-------|------|-------------|
| BigQuery Table Health | database | `get_bq()`, running a SQL query |
| Redis Inspector | redis | `get_redis()`, key introspection |
| GCS Bucket Browser | gcs_bucket | `get_gcs()`, listing objects |
| Pipeline Run History | pipeline | Combining BQ + metadata queries |
| Schema Explorer | schema | Cross-resource documentation |

These nodes are pre-configured with `gcp_project_id = null` and `sa_id = null` — they show the notebook structure and `kb_client` usage but will raise a clear `EnvironmentError` if a user tries to run them without configuring GCP credentials first. The error message guides them to Settings.

#### Step 4: Done

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   ✓  DataKB is ready                                         │
│                                                              │
│   Your knowledge graph is running at:                        │
│   http://localhost:8000                                      │
│                                                              │
│   Next steps:                                                │
│   → Add your team's infrastructure nodes                     │
│   → Connect a GCP project in Settings                        │
│   → Invite teammates in Settings → Users                     │
│                                                              │
│   [ Open the knowledge graph → ]                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### First-run completion

When the wizard completes, the backend:
1. Creates the admin user record
2. Clears the `FIRST_RUN` flag
3. Issues a JWT for the admin user
4. Redirects to `/` (graph canvas)

All subsequent starts skip the wizard entirely — the DB has users so first-run mode is never re-entered.

### Empty state — graph canvas

When the graph has no nodes (either because the user skipped example data or started fresh), the canvas shows a centred empty state instead of a blank canvas:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│                                                              │
│            Your knowledge graph is empty.                    │
│                                                              │
│        Add your first node to get started.                   │
│                                                              │
│              [ + Add your first node ]                       │
│                                                              │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 20. Error Handling & Edge Cases

This section defines how the system behaves in every meaningful failure scenario. These are not nice-to-haves — they must be implemented alongside the happy path in each phase.

### 20.1 Storage backend failures

**Backend unreachable at startup (GCS/S3 bucket not found or no credentials):**
- FastAPI startup emits a `WARNING` log: `Storage backend health check failed: {error}. Retrying on first request.`
- The app starts anyway — a broken storage backend should not prevent reading the graph metadata from the DB
- On the first request that requires the storage backend, a `503 Service Unavailable` is returned with body: `{ "error": "storage_unavailable", "message": "The notebook storage backend is unreachable. Check STORAGE_GCS_BUCKET and GCS credentials." }`
- The frontend shows a persistent banner at the top of the graph: *"Notebook storage is unavailable — notebooks cannot be opened or saved. Check your configuration."*

**Write fails mid-autosave:**
- The autosave endpoint returns `503`
- The frontend marks the notebook as "unsaved" with a red dot indicator
- Auto-save retries every 30 seconds (instead of 60) until it succeeds
- If 5 consecutive auto-saves fail, the frontend shows a modal: *"Auto-save has failed 5 times. Your changes are at risk. Copy your work to a safe place or try refreshing."*

**Read fails when opening a notebook:**
- `GET /api/notebooks/{node_id}` returns `503`
- The notebook editor shows an error state: *"Could not load this notebook from storage. The storage backend may be temporarily unavailable."* with a Retry button

### 20.2 Kernel and Jupyter Server failures

**Jupyter Server process crashes:**
- FastAPI's lifespan task detects the process has exited (non-zero return code)
- Attempts restart up to 3 times with exponential backoff (2s, 4s, 8s)
- If all 3 restarts fail, FastAPI returns `503` on all `/api/kernels/*` endpoints
- The graph canvas shows a banner: *"The notebook execution engine is not running. Kernels cannot be started."*
- The failure is logged with the Jupyter Server's stderr output for diagnosis

**Kernel start fails (e.g. OOM, bad env vars):**
- `POST /api/kernels` returns `500` with `{ "error": "kernel_start_failed", "message": "..." }`
- The frontend shows: *"Failed to start a kernel for this notebook. This may be a temporary resource issue — try again in a moment."*
- The kernel session is not created in the DB

**Kernel dies mid-session (OOM, crash):**
- Jupyter Server sends a `status: dead` message over the WebSocket
- The frontend receives this, shows a banner in the notebook editor: *"Your session has ended unexpectedly. Your last auto-save is preserved. Restart the session to continue."*
- The `kernel_sessions` record is marked `is_active = 0`
- The user's last auto-saved notebook content is preserved in storage and loadable on next open

**WebSocket disconnects (network blip):**
- The frontend attempts to reconnect the WebSocket up to 5 times with 1s delays
- During reconnect, running cells show a spinner with label *"Reconnecting..."*
- If reconnection succeeds, execution continues
- If all 5 reconnect attempts fail, the session is treated as dead (same as kernel death above)

**Kernel idle timeout:**
- Background task shuts down the kernel after `KERNEL_IDLE_TIMEOUT_MINUTES` of inactivity
- A `datakb.kernel.idle_shutdown` message is sent over the WebSocket 2 minutes before shutdown: *"Your session will end in 2 minutes due to inactivity."*
- The user can click "Keep alive" to reset the idle timer
- On shutdown, the kernel session is marked inactive. The notebook content is preserved via the last auto-save.

### 20.3 GCP credential failures

**SA key file not found in SECRETS_DIR:**
- `CredentialInjector._get_token_and_project` raises `FileNotFoundError`
- `POST /api/kernels` returns `500` with `{ "error": "credential_error", "message": "Service account key file not found. The file may have been deleted from the secrets directory. Re-upload the key file in Settings → Service Accounts." }`
- The frontend shows this message in a modal, with a button linking directly to the SA settings page

**SA key file is invalid or revoked:**
- `google.auth.exceptions.TransportError` or `google.auth.exceptions.RefreshError`
- Same `500` response with message: *"Failed to generate an access token for {sa_email}. The key may be revoked or the SA may have been deleted. Check the GCP console and re-upload a valid key."*

**SA lacks required permissions:**
- Token generation succeeds (the SA exists and the key is valid), but the first GCP API call inside the notebook fails with `google.api_core.exceptions.PermissionDenied`
- This surfaces as a Python traceback in the notebook cell output — the kernel is running fine, the SA simply does not have the IAM roles needed
- `kb_client` catches this and re-raises with a helpful message: `PermissionDenied: The service account {sa_email} does not have permission to access {resource}. Ask your GCP admin to grant the required role.`

**Access token expiry during a long kernel session:**
- After 1 hour, the injected `DATAKB_ACCESS_TOKEN` expires
- `kb_client.get_bq()` etc. will produce a `google.auth.exceptions.RefreshError` because the `Credentials` object cannot refresh (it was created from a static token string)
- The error message from `kb_client`: `TokenExpiredError: Your DataKB session credentials have expired (1-hour limit). Restart your kernel session to get fresh credentials.`
- This is a known v1 limitation — tracked in Open Questions

**SA test connection failure (Settings UI):**
- `POST /api/gcp/service-accounts/{id}/test` returns `200` (not 5xx — the test endpoint itself worked) with `{ "success": false, "error": "permission_denied", "message": "The service account exists but generateAccessToken failed. Ensure the DataKB backend SA has roles/iam.serviceAccountTokenCreator on this SA." }`
- The Settings UI shows a red ✗ badge next to the SA with the error message inline

### 20.4 Notebook metadata YAML failures

**Metadata cell missing:**
- On save, the backend attempts to parse the first cell as YAML
- If the first cell is not a raw cell, or its content does not start with `# datakb`, the sync is skipped silently
- The node's `updated_at` is updated (the notebook was saved) but title/tags/links are not changed
- A warning is returned in the save response: `{ "saved": true, "metadata_synced": false, "warning": "Metadata cell not found. Node metadata was not synced." }`
- The frontend shows a subtle yellow indicator on the notebook toolbar: *"Metadata not synced"* with a tooltip explaining why

**Metadata cell is malformed YAML:**
- `yaml.YAMLError` is caught during parse
- Same warning response as above, with message: *"Metadata cell contains invalid YAML: {parse error}. Fix the syntax to enable metadata sync."*

**Link target node not found:**
- During metadata sync, a `links` entry references a node title that does not exist in the DB
- The unresolvable link is skipped; resolved links are still created
- Warning: `{ "unresolved_links": ["Auth Service Pipeline"] }`
- The frontend shows this in the node detail panel: *"1 relationship could not be synced — node 'Auth Service Pipeline' not found."*

### 20.5 Authentication failures

**Invalid or expired JWT:**
- All `/api/*` endpoints return `401 Unauthorized` with `{ "error": "token_expired" }`
- The frontend intercepts 401s globally, attempts a silent token refresh using the httpOnly refresh cookie
- If refresh succeeds, the original request is retried transparently
- If refresh fails (refresh token also expired), the user is redirected to `/login` with a message: *"Your session has expired. Please log in again."*

**Google OAuth domain restriction violated:**
- User logs in with a Google account outside `GOOGLE_ALLOWED_DOMAIN`
- Backend returns `403` with `{ "error": "domain_not_allowed", "message": "Only @company.com accounts are permitted." }`
- Frontend shows this message on the login page

**First login via Google (user record does not exist):**
- Backend auto-creates a `viewer` role user on first Google SSO login
- The user can immediately browse the graph but cannot run notebooks
- An admin must promote them to `editor` via Settings → Users
- A banner is shown to the new user: *"Your account has been created with viewer access. Contact an admin to request editor access."*

### 20.6 Concurrent edit conflict

**Two editors save the same notebook within the same auto-save window:**
- Storage backends are last-write-wins — the second save silently overwrites the first
- The backend detects this by comparing the `updated_at` timestamp: if the storage file's last-modified is newer than what the client sent with its save request, a conflict is detected
- The save returns `409 Conflict` with `{ "error": "conflict", "conflict_version": { "saved_at": "...", "saved_by": "bob@company.com" } }`
- The frontend shows a modal: *"This notebook was saved by bob@company.com 12 seconds ago. Saving now will overwrite their changes. You can: [Save anyway] [View their version] [Cancel]"*
- "View their version" opens a diff panel showing cell-by-cell differences

---

## 21. Frontend Component Tree

This is the complete React component hierarchy. Components are grouped by feature area. All data fetching uses React Query. Global state (auth token, active kernel sessions, graph filter state) uses Zustand.

```
App
├── AuthProvider                         # JWT context, refresh logic
├── Router
│   ├── /login          → LoginPage
│   │   ├── LocalLoginForm
│   │   └── GoogleLoginButton
│   │
│   ├── /setup          → SetupWizard
│   │   ├── WelcomeStep
│   │   ├── CreateAdminStep
│   │   ├── ExampleDataStep
│   │   └── DoneStep
│   │
│   ├── /              → GraphPage
│   │   ├── TopBar
│   │   │   ├── SearchInput              # live filter — updates Zustand graphFilter
│   │   │   ├── TypeFilterPills
│   │   │   ├── TeamFilterPills
│   │   │   ├── LayoutToggle
│   │   │   └── AddNodeButton
│   │   ├── GraphCanvas                  # React Flow wrapper
│   │   │   ├── NodeRenderer             # custom node component
│   │   │   │   ├── NodeTypeBadge
│   │   │   │   ├── NodeTitle
│   │   │   │   ├── NodeTeamTag
│   │   │   │   ├── NotebookIndicator    # dot: has notebook / none
│   │   │   │   └── ActiveKernelPulse    # animated: N active sessions
│   │   │   └── EdgeRenderer            # custom edge with label
│   │   ├── NodeDetailPanel             # slide-in on node click
│   │   │   ├── NodeHeader              # title, type badge, team
│   │   │   ├── NodeDescription         # rendered markdown
│   │   │   ├── ExecutionConfig         # GCP project, SA, resources (read-only)
│   │   │   ├── RelationshipList
│   │   │   │   └── RelationshipItem    # edge label + neighbour node (clickable)
│   │   │   ├── RunMetadata             # last run: by / when
│   │   │   ├── OpenNotebookButton
│   │   │   └── EditNodeButton
│   │   └── EmptyGraphState             # shown when no nodes exist
│   │
│   ├── /nodes/new      → NodeEditorPage
│   │   └── NodeEditorForm
│   │       ├── MetadataTab
│   │       │   ├── TitleInput
│   │       │   ├── TypeSelect
│   │       │   ├── TeamInput            # autocomplete
│   │       │   ├── DescriptionEditor    # markdown textarea + preview toggle
│   │       │   └── TagInput             # chip input
│   │       ├── ExecutionTab
│   │       │   ├── GCPProjectSelect     # dropdown of configured projects
│   │       │   ├── ServiceAccountSelect # dropdown filtered by project
│   │       │   ├── ResourceBindings     # multi-select checklist
│   │       │   └── NotebookAttachment   # upload / create blank / none
│   │       └── RelationshipsTab
│   │           ├── EdgeTable
│   │           └── AddEdgeForm
│   │               ├── NodeSearch       # search all nodes
│   │               └── EdgeLabelSelect
│   │
│   ├── /nodes/:id/edit → NodeEditorPage (same as above, pre-filled)
│   │
│   ├── /nodes/:id/notebook → NotebookPage
│   │   ├── NotebookTopBar
│   │   │   ├── BackToGraphLink
│   │   │   ├── NotebookTitle
│   │   │   ├── KernelStatusIndicator    # ● running / ○ stopped / ◌ starting
│   │   │   ├── RunCellButton
│   │   │   ├── RunAllButton
│   │   │   ├── RestartKernelButton
│   │   │   ├── InterruptButton
│   │   │   ├── SaveSnapshotButton       # opens SaveSnapshotModal
│   │   │   ├── AutosaveIndicator        # "Saved 12s ago" / "Unsaved ●"
│   │   │   └── HistoryButton            # opens VersionHistoryPanel
│   │   ├── SessionBanner
│   │   │   ├── ActiveSessionInfo        # SA email, resources bound
│   │   │   ├── StartSessionButton
│   │   │   └── EndSessionButton
│   │   ├── StorageErrorBanner           # shown if storage backend is down
│   │   ├── MetadataSyncWarning          # shown if YAML cell missing/invalid
│   │   ├── CellList
│   │   │   └── Cell (× N)
│   │   │       ├── CellGutter           # execution count [3], run button
│   │   │       ├── CodeEditor           # CodeMirror 6 (code cells)
│   │   │       │   └── (PythonLanguage, autocompletion, bracketMatching)
│   │   │       ├── MarkdownEditor       # textarea + preview (markdown cells)
│   │   │       ├── RawEditor            # plain textarea (raw cells — metadata)
│   │   │       ├── CellOutput
│   │   │       │   ├── TextOutput
│   │   │       │   ├── DataFrameOutput  # scrollable HTML table
│   │   │       │   ├── ImageOutput      # PNG/SVG inline
│   │   │       │   └── ErrorOutput      # red-tinted traceback, collapsible
│   │   │       └── CellToolbar          # add above/below, delete, move, type change
│   │   ├── SaveSnapshotModal
│   │   │   └── MessageInput
│   │   ├── VersionHistoryPanel          # slide-in from right
│   │   │   ├── SnapshotList
│   │   │   │   └── SnapshotItem         # message, author, date, Restore/Diff
│   │   │   └── AutosaveList
│   │   │       └── AutosaveItem         # timestamp, author, Restore
│   │   └── ConflictModal               # shown on 409 save conflict
│   │       ├── ConflictInfo             # who saved, when
│   │       ├── SaveAnywayButton
│   │       ├── ViewDiffButton
│   │       └── CancelButton
│   │
│   └── /settings       → SettingsPage  (admin only)
│       ├── SettingsSidebar              # tab navigation
│       ├── GCPProjectsTab
│       │   ├── ProjectTable
│       │   │   └── ProjectRow           # project ID, SA count, node count, delete
│       │   └── AddProjectModal
│       │       ├── ProjectIdInput
│       │       └── DisplayNameInput
│       ├── ServiceAccountsTab
│       │   ├── ProjectFilter            # filter SA list by project
│       │   ├── SATable
│       │   │   └── SARow
│       │   │       ├── SAInfo           # email, display name, credential type
│       │   │       ├── TestConnectionButton  # inline result: ✓ or ✗ + message
│       │   │       └── DeleteSAButton
│       │   └── AddSAModal
│       │       ├── SAEmailInput
│       │       ├── DisplayNameInput
│       │       ├── CredentialTypeToggle # key_file / workload_identity
│       │       └── KeyFileUpload        # drag-and-drop, shown if key_file selected
│       ├── ResourcesTab
│       │   ├── ResourceTable
│       │   │   └── ResourceRow
│       │   └── AddResourceModal
│       │       ├── NameInput
│       │       ├── TypeSelect
│       │       ├── GCPProjectSelect
│       │       ├── SASelect
│       │       └── TypeSpecificFields   # dynamic — see Resource Registry section
│       └── UsersTab
│           ├── UserTable
│           │   └── UserRow
│           │       ├── UserInfo         # email, name, team
│           │       ├── RoleSelect       # admin / editor / viewer
│           │       ├── TeamInput
│           │       └── DeactivateButton
│           └── InviteUserModal
│               └── EmailInput
```

### State management

**Zustand stores:**

```typescript
// stores/auth.ts
interface AuthStore {
  user: User | null
  token: string | null
  setToken: (token: string) => void
  logout: () => void
}

// stores/graph.ts
interface GraphStore {
  filter: { search: string; types: NodeType[]; teams: string[] }
  selectedNodeId: string | null
  setFilter: (f: Partial<GraphFilter>) => void
  selectNode: (id: string | null) => void
}

// stores/kernels.ts
interface KernelStore {
  sessions: Record<string, KernelSession>  // nodeId → session
  startSession: (nodeId: string) => Promise<void>
  endSession: (nodeId: string) => Promise<void>
}

// stores/notebook.ts
interface NotebookStore {
  cells: Cell[]
  dirty: boolean                          // unsaved changes
  lastSavedAt: Date | null
  conflictInfo: ConflictInfo | null
  updateCell: (id: string, content: string) => void
  setDirty: (v: boolean) => void
}
```

**React Query usage:**
- All reads use React Query with appropriate stale times (`graph` data: 30s, `node` detail: 10s, `notebook`: fetched once per open)
- All mutations (create node, save notebook, start kernel) use React Query mutations with optimistic updates where safe

---

## 22. Contributing Guide

### Philosophy

DataKB welcomes contributions at all levels — bug fixes, documentation, new storage adapters, new resource types, and new features. The contribution process is designed to be lightweight for small changes and structured for larger ones.

The two most impactful contribution types for expanding DataKB's reach are **storage adapters** (adding Azure Blob Storage, Cloudflare R2, etc.) and **resource types** (adding Snowflake, Databricks, AWS RDS, etc.). These have defined plugin interfaces specifically so that contributors don't need to understand the full codebase.

### Development setup

**Prerequisites:** Python 3.12+, Node 20+, Docker (optional but recommended)

```bash
# 1. Clone
git clone https://github.com/datakb/datakb
cd datakb

# 2. Backend setup
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt   # ruff, mypy, pytest, httpx

# 3. Run DB migrations (creates SQLite at ../data/datakb.db)
alembic upgrade head

# 4. Start backend in dev mode (hot reload)
uvicorn main:app --reload --port 8000

# 5. Frontend setup (separate terminal)
cd ../frontend
npm install
npm run dev   # Vite dev server at localhost:5173

# 6. Client library setup (optional — only if modifying kb_client)
cd ../client
pip install -e ".[dev]"
```

When running in dev mode, the frontend Vite server proxies `/api/*` to `localhost:8000`, so you can work on frontend and backend simultaneously without a Docker build.

**Run tests:**

```bash
# Backend unit tests
cd backend && pytest

# Backend with coverage
pytest --cov=. --cov-report=html

# Frontend tests
cd frontend && npm test

# Full integration test (requires Docker)
make test-integration
```

**Lint and type check:**

```bash
make lint   # runs: ruff check backend/ client/, mypy backend/, eslint frontend/src/
```

All of these must pass before a PR can be merged. The CI runs them automatically.

### Adding a storage adapter

Storage adapters live in `backend/services/storage/`. Each adapter is a class that extends `StorageBackend` (defined in `base.py`) and implements all 7 abstract methods.

**Step-by-step:**

1. Create `backend/services/storage/myadapter.py`
2. Implement all methods from `StorageBackend`
3. Add your adapter to the factory in `backend/services/storage/__init__.py`:

```python
# backend/services/storage/__init__.py
def get_storage_backend() -> StorageBackend:
    backend = settings.STORAGE_BACKEND
    if backend == "local":
        return LocalAdapter(settings.STORAGE_LOCAL_PATH)
    elif backend == "gcs":
        return GCSAdapter(settings.STORAGE_GCS_BUCKET, settings.STORAGE_GCS_PREFIX)
    elif backend == "s3":
        return S3Adapter(settings.STORAGE_S3_BUCKET, settings.STORAGE_S3_PREFIX, settings.STORAGE_S3_REGION)
    elif backend == "azure":                          # ← add your adapter here
        return AzureAdapter(settings.STORAGE_AZURE_CONTAINER, settings.STORAGE_AZURE_PREFIX)
    else:
        raise ValueError(f"Unknown storage backend: {backend}")
```

4. Add the required env vars to `config.py` (with defaults of `None`)
5. Add tests in `backend/tests/test_storage_myadapter.py` — use the shared `StorageBackendTests` mixin which runs the full conformance suite against any adapter:

```python
# backend/tests/test_storage_azure.py
import pytest
from tests.storage_conformance import StorageBackendConformanceTests
from services.storage.azure import AzureAdapter

@pytest.mark.skipif(
    not os.getenv("AZURE_TEST_CONTAINER"),
    reason="AZURE_TEST_CONTAINER not set"
)
class TestAzureAdapter(StorageBackendConformanceTests):
    @pytest.fixture
    def backend(self):
        return AzureAdapter(
            container=os.environ["AZURE_TEST_CONTAINER"],
            prefix="test-runs/"
        )
```

6. Document the env vars in `docs/storage-backends.md`
7. Open a PR — the CI will skip the Azure tests unless `AZURE_TEST_CONTAINER` is set in the repo secrets, which maintainers set up for adapters that reach stable status

### Adding a resource type

Resource types define what `kb_client` can connect to. Adding a new type involves three parts: the backend config schema, the credential injector handling, and the `kb_client` helper function.

**Step-by-step:**

1. Decide on a type name (string): e.g. `snowflake`, `databricks`, `redshift`

2. Add the type to the `resources.type` CHECK constraint in the DB schema (new Alembic migration):

```python
# backend/db/migrations/versions/xxx_add_snowflake_resource_type.py
def upgrade():
    op.execute("""
        ALTER TABLE resources
        DROP CONSTRAINT resources_type_check
    """)
    op.execute("""
        ALTER TABLE resources
        ADD CONSTRAINT resources_type_check
        CHECK (type IN ('bigquery','redis','gcs','http','tcp','custom','snowflake'))
    """)
```

3. Add env var injection to `CredentialInjector.build_kernel_env`:

```python
elif resource.type == "snowflake":
    cfg = json.loads(resource.config)
    env[f"DATAKB_RESOURCE_{key}_ACCOUNT"] = cfg["account"]
    env[f"DATAKB_RESOURCE_{key}_USER"] = cfg["user"]
    env[f"DATAKB_RESOURCE_{key}_DATABASE"] = cfg.get("database", "")
    if resource.password_ref:
        env[f"DATAKB_RESOURCE_{key}_PASSWORD"] = self._read_secret(resource.password_ref)
```

4. Add a `get_snowflake()` helper to `client/kb_client/__init__.py`:

```python
def get_snowflake(resource_name: str):
    import snowflake.connector
    key = _resource_key(resource_name, "DATAKB_DEFAULT_SNOWFLAKE")
    account  = _env(f"{key}_ACCOUNT", required=True)
    user     = _env(f"{key}_USER", required=True)
    password = _env(f"{key}_PASSWORD", required=True)
    database = _env(f"{key}_DATABASE")
    return snowflake.connector.connect(
        account=account, user=user, password=password, database=database
    )
```

5. Add the config schema to the Settings UI resource modal in `frontend/src/components/settings/AddResourceModal.tsx` — add a new case in the `TypeSpecificFields` component

6. Document the resource type in `docs/writing-notebooks.md`

7. Open a PR

### PR process

**Small changes** (bug fixes, docs, dependency updates): open a PR directly. No issue required. One approval needed from a maintainer.

**Medium changes** (new storage adapters, new resource types, UI improvements): open an issue first describing what you're adding and why. Wait for a maintainer to label it `accepted` before starting work. This prevents duplicate effort.

**Large changes** (new features, architectural changes, breaking API changes): open an issue and request a design discussion. A brief design doc (can be a comment on the issue) is expected before any code is written.

**Commit style:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). The CHANGELOG is auto-generated from commit messages on release.

### Code style

- **Backend:** `ruff` for linting and formatting (configured in `pyproject.toml`), `mypy` for type checking (strict mode). All functions must have type annotations. All public functions must have docstrings.
- **Frontend:** ESLint + Prettier. Functional components only. No class components. All props must be typed with TypeScript interfaces.
- **Client:** Same as backend.

### Release process (maintainers only)

1. Update `CHANGELOG.md` (auto-generated via `git changelog`)
2. Bump version in `backend/pyproject.toml`, `client/pyproject.toml`, and `frontend/package.json`
3. Create and push a version tag: `git tag v1.1.0 && git push --tags`
4. GitHub Actions (`docker.yml`) builds and pushes the Docker image to GHCR
5. GitHub Actions (`publish-client.yml`) publishes `datakb-client` to PyPI
6. Create a GitHub Release with the CHANGELOG entry as the description

