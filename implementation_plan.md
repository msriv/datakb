# DataKB — Implementation Plan

> Tracks build progress phase by phase.
> Update this file as tasks are completed or scope changes.
> Last updated: 2026-04-17 — Phase 1 implementation complete

---

## Status legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked / needs decision

---

## Phase 1 — Graph core (weeks 1–3)

**Goal:** Running graph with real data, deployed locally via Docker Compose.

### Monorepo setup
- [x] Initialise monorepo: `backend/`, `frontend/`, `client/`, `deploy/`, `examples/`, `docs/`
- [x] Create root `Makefile` with `dev`, `test`, `lint`, `build`, `db-migrate`, `db-reset`, `gen-api` targets
- [x] Set up GitHub Actions CI: lint + test on every PR, Docker build check on main
- [x] Configure `ruff` + `mypy` for backend, `eslint` + `prettier` for frontend

### Backend — database & models
- [x] Set up SQLAlchemy async engine with SQLite (default) and PostgreSQL support
- [x] Create Alembic migration environment (`backend/db/migrations/`)
- [x] Write initial migration: `nodes`, `edges`, `users`, `gcp_projects`, `service_accounts`, `resources`, `kernel_sessions`, `snapshots`, `autosaves` tables
- [x] Auto-run migrations on app startup via lifespan hook

### Backend — auth
- [x] Implement local auth: `POST /api/auth/login` → JWT + httpOnly refresh cookie
- [x] Implement `POST /api/auth/refresh` (refresh token → new JWT)
- [x] Implement `GET /api/auth/me`
- [x] JWT middleware on all `/api/*` routes
- [x] Role enforcement decorator (`require_role`)

### Backend — graph API
- [x] `GET /api/graph` — nodes + edges, with `current_user_access` resolved
- [x] `POST /api/nodes` — create node (editor role)
- [x] `GET /api/nodes/{id}` — single node
- [x] `PUT /api/nodes/{id}` — partial update (editor role)
- [x] `DELETE /api/nodes/{id}` — soft-delete / archive (editor role)
- [x] `POST /api/edges` — create edge, enforce unique (source, target, label)
- [x] `DELETE /api/edges/{id}` — delete edge

### Backend — storage (LocalAdapter only for Phase 1)
- [x] Define `StorageBackend` abstract base class (7 methods: read, write, delete, list, exists, read_version, list_versions)
- [x] Implement `LocalAdapter` with `.versions/` directory for autosave history

### Backend — health
- [x] `GET /api/health` — DB ping + Jupyter Server status

### Frontend — setup
- [x] Vite + React 18 + TypeScript scaffold
- [x] TailwindCSS config
- [x] React Flow installed
- [x] `openapi-typescript` codegen wired into `make gen-api`
- [x] Zustand stores: `auth`, `graph`, `kernels`, `notebook`
- [x] React Query setup with global error interceptor (auto-refresh on 401)

### Frontend — graph canvas
- [x] `GraphPage` — full-screen React Flow canvas
- [x] `NodeRenderer` — custom node component with type colour, icon, team tag, notebook dot indicator, active kernel pulse
- [x] `EdgeRenderer` — custom edge with label
- [x] `TopBar` — search input (live filter), type filter pills, layout toggle, Add Node button, user avatar
- [x] `NodeDetailPanel` — slide-in panel: description, execution config, relationships, tags, last run, Open Notebook + Edit buttons
- [x] `EmptyGraphState` — shown when graph has no nodes

### Frontend — node editor
- [x] `NodeEditorPage` (create + edit)
- [x] Tab 1 — Metadata: title, type, team, description (markdown), tags
- [x] Tab 3 — Relationships: edge table, add edge form with node autocomplete

### Docker
- [x] Multi-stage `Dockerfile` (frontend builder → kernel env → app env → final)
- [x] `docker-compose.yml` (SQLite + local storage, zero external deps)
- [x] First-run wizard: detect empty DB → redirect to `/setup`
- [x] Setup wizard: 4 steps — Welcome → Create admin → Example data → Done
- [x] Seed script: 5 example nodes + edges

### ✅ Phase 1 success criteria
- `docker compose up` → graph renders with seeded nodes
- Create nodes and edges via UI
- Node detail panel shows all metadata

---

## Phase 2 — Notebook editor (weeks 4–6)

**Goal:** Click a node → edit a notebook → run cells → save — all in the browser.

### Backend — Jupyter Server
- [ ] `JupyterManager` service: launch Jupyter Server subprocess on `127.0.0.1:8888`
- [ ] Auto-restart on crash (up to 3 retries with backoff)
- [ ] Health check included in `GET /api/health` (`jupyter_server` field)
- [ ] Kernel idle timeout background task (`KERNEL_IDLE_TIMEOUT_MINUTES`, default 30)
- [ ] 2-minute idle warning: send `datakb.kernel.idle_warning` shell message over WebSocket

### Backend — notebooks API
- [ ] `GET /api/notebooks/{node_id}` — fetch `.ipynb` JSON from StorageBackend
- [ ] `PUT /api/notebooks/{node_id}/autosave` — save + conflict detection via `client_updated_at`
- [ ] Parse metadata YAML from first raw cell on save → sync node record
- [ ] `POST /api/notebooks/{node_id}/snapshots` — named snapshot
- [ ] `GET /api/notebooks/{node_id}/snapshots` — list snapshots
- [ ] `GET /api/notebooks/{node_id}/versions` — merged autosave + snapshot history
- [ ] `GET /api/notebooks/{node_id}/versions/{vid}` — fetch historical content
- [ ] `POST /api/notebooks/{node_id}/restore/{vid}` — restore version

### Backend — kernels API
- [ ] `POST /api/kernels` — start kernel for a node (editor+ role)
- [ ] `GET /api/kernels/{kernel_id}` — kernel status
- [ ] `DELETE /api/kernels/{kernel_id}` — stop kernel
- [ ] `WS /api/kernels/{kernel_id}/channels` — WebSocket proxy to Jupyter Server (validate JWT from `token` query param before proxying)

### Frontend — notebook editor
- [ ] `NotebookPage` — full-page view with top bar and cell list
- [ ] `NotebookTopBar` — back link, title, type badge, kernel status, run/restart/interrupt buttons, autosave indicator, snapshot button, history button
- [ ] `SessionBanner` — active session info (SA email, resources), Start/End session buttons
- [ ] `CellList` — renders all cells in order
- [ ] `Cell` — gutter (exec count, run button), `CodeEditor` (CodeMirror 6 + Python), `CellOutput` (text / DataFrame / PNG / traceback)
- [ ] `MarkdownEditor` — textarea + preview toggle for markdown cells
- [ ] `RawEditor` — plain textarea for raw metadata cells
- [ ] `CellToolbar` — add above/below, delete, move, change type
- [ ] Auto-save every 60s (only when session active + notebook dirty)
- [ ] `SaveSnapshotModal` — message input
- [ ] `VersionHistoryPanel` — slide-in list of snapshots + autosaves with Restore + diff
- [ ] `ConflictModal` — shown on 409, options: save anyway / view diff / cancel
- [ ] Read-only mode for `viewer` role (no Run button, banner explaining)

### Frontend — node editor (Phase 2 addition)
- [ ] Tab 2 — Execution: GCP project select, SA select, resource bindings, notebook attachment (upload / create blank)

### kb_client v0.1.0
- [ ] Package scaffold: `client/kb_client/__init__.py`
- [ ] `get_bq()`, `get_redis()`, `get_gcs()`, `get_http()`, `get_custom()` — reads from env vars only (no actual GCP calls yet)
- [ ] Clear `EnvironmentError` messages when env vars missing
- [ ] Pre-installed in Docker image kernel Python environment
- [ ] Published to PyPI as `datakb-client`

### ✅ Phase 2 success criteria
- Open a node → start session → write Python → run cell → see output
- Auto-save fires at 60s → toolbar shows "Saved Xs ago"
- Open history panel → restore a past version
- Conflict modal appears when two editors save simultaneously

---

## Phase 3 — GCP config + credential injection (weeks 7–9)

**Goal:** Notebooks connect to real GCP resources via `kb_client` with credentials managed in the UI.

### Backend — GCP config API
- [ ] `GET /api/gcp/projects` — list projects (admin)
- [ ] `POST /api/gcp/projects` — register project (admin)
- [ ] `DELETE /api/gcp/projects/{id}` — remove project, fail if SAs/nodes reference it
- [ ] `GET /api/gcp/projects/{id}/service-accounts` — list SAs (admin)
- [ ] `POST /api/gcp/projects/{id}/service-accounts` — add SA, multipart: JSON metadata + key file upload
  - Validate key file is valid GCP SA JSON
  - Store at `SECRETS_DIR/{uuid}.json` with `chmod 0600`
- [ ] `DELETE /api/gcp/service-accounts/{id}` — remove SA + delete key file, fail if nodes reference it
- [ ] `POST /api/gcp/service-accounts/{id}/test` — generate token, return `TestConnectionResponse`
- [ ] `CredentialInjector.build_kernel_env()` — SA → token + resource env var map
- [ ] Key file credential type (load from `SECRETS_DIR`)
- [ ] Workload Identity credential type (ADC + impersonation via `google-auth`)
- [ ] Token generation for both credential types
- [ ] Update `POST /api/kernels` to call `CredentialInjector` before starting kernel

### Backend — resources API
- [ ] `GET /api/resources` — list (admin)
- [ ] `POST /api/resources` — create, store password in `SECRETS_DIR/{uuid}.secret`
- [ ] `GET /api/resources/{id}` — get (admin)
- [ ] `PUT /api/resources/{id}` — update, rotate password if provided
- [ ] `DELETE /api/resources/{id}` — delete + remove password file
- [ ] Env var injection per resource type: `bigquery`, `redis`, `gcs`, `http`, `tcp`, `custom`

### Frontend — settings
- [ ] `SettingsPage` with sidebar nav
- [ ] `GCPProjectsTab` — table + Add Project modal
- [ ] `ServiceAccountsTab` — project filter dropdown, SA table, Add SA modal (key file drag-and-drop upload + workload identity), Test Connection button with inline result
- [ ] `ResourcesTab` — resource table, Add Resource modal with type-specific fields
- [ ] `UsersTab` — user table, role/team editor, Invite User modal
- [ ] Settings link in sidebar

### kb_client v0.2.0
- [ ] `get_bq(resource_name?)` — real BigQuery client from injected token
- [ ] `get_redis(resource_name?)` — real Redis client from injected host/port/password
- [ ] `get_gcs(resource_name?)` — real GCS client from injected token
- [ ] `get_http(resource_name)` — requests.Session with auth pre-configured
- [ ] `get_custom(resource_name)` — returns raw config dict
- [ ] `datakb export-env` CLI — fetches env vars for a node from a running DataKB instance (for local notebook development)

### ✅ Phase 3 success criteria
- Maintainer adds GCP project + SA key file via UI → Test Connection shows ✓
- Maintainer adds redis resource → binds to a node
- Developer opens notebook, runs `get_redis("payments-redis")` → live Redis client
- SA key file never appears in any API response

---

## Phase 4 — Storage backends + open source launch (weeks 10–12)

**Goal:** GCS and S3 adapters working; public GitHub release.

### Backend — storage adapters
- [ ] `GCSAdapter` — uses `google-cloud-storage`, native object versioning for history
- [ ] `S3Adapter` — uses `aioboto3`, S3 versioning for history
- [ ] Storage backend factory in `backend/services/storage/__init__.py`
- [ ] Integration tests for all 3 backends (skip GCS/S3 unless env var set)
- [ ] `StorageBackendConformanceTests` mixin for adapter testing

### Backend — Google OAuth
- [ ] `GET /api/auth/google` — initiate OAuth flow
- [ ] `GET /api/auth/callback` — exchange code, create/update user, set cookie, redirect
- [ ] Domain restriction via `GOOGLE_ALLOWED_DOMAIN`
- [ ] Auto-create `viewer` role on first Google login

### Error handling (all phases)
- [ ] Storage backend unreachable: 503 + frontend banner
- [ ] Autosave failure: retry every 30s, modal after 5 failures
- [ ] Jupyter Server crash: auto-restart + 503 on kernel endpoints
- [ ] Kernel death mid-session: `kernel_dead` WS message + frontend banner
- [ ] WS disconnect: 5 reconnect attempts with 1s delays
- [ ] Idle warning 2min before timeout
- [ ] SA key file not found: 500 with guidance message
- [ ] SA token generation failure: 500 with specific error code
- [ ] GCP permission denied: `kb_client` re-raises with helpful message
- [ ] Token expiry after 1hr: `kb_client` raises `TokenExpiredError` with restart guidance
- [ ] Metadata YAML missing/malformed: save succeeds, warning in response + UI indicator
- [ ] Link target node not found: skip + `unresolved_links` in response
- [ ] JWT expired: frontend intercepts 401, silent refresh, retry
- [ ] Last admin demotion blocked: 400 with `last_admin` error code
- [ ] Concurrent edit: 409 `ConflictError` + `ConflictModal`

### Example notebooks (5 pre-built)
- [ ] `bigquery-table-health.ipynb` — schema inspection, row count, staleness check
- [ ] `redis-inspector.ipynb` — key count, TTL distribution, memory usage, top keys
- [ ] `gcs-bucket-browser.ipynb` — list objects, size breakdown, recent uploads
- [ ] `pipeline-run-history.ipynb` — query Airflow/BQ for recent DAG run metadata
- [ ] `schema-explorer.ipynb` — cross-resource schema discovery

### Documentation
- [ ] README.md — project overview, quick start (`docker compose up`), screenshot
- [ ] `docs/getting-started.md` — local, GCP Cloud Run, AWS
- [ ] `docs/configuration.md` — all env vars with defaults
- [ ] `docs/gcp-setup.md` — SA creation, key file, Workload Identity
- [ ] `docs/writing-notebooks.md` — metadata YAML spec, recommended structure, `kb_client` reference
- [ ] `docs/storage-backends.md` — local, GCS, S3 setup
- [ ] `docs/contributing/development-setup.md`
- [ ] `docs/contributing/adding-storage-adapter.md`
- [ ] `docs/contributing/adding-resource-type.md`
- [ ] `CONTRIBUTING.md` — PR process, code style, release process
- [ ] `CHANGELOG.md`

### CI/CD
- [ ] GitHub Actions: Docker image → GHCR on tag
- [ ] GitHub Actions: `datakb-client` → PyPI on tag
- [ ] GitHub Actions: docs site deploy (MkDocs → GitHub Pages)

### ✅ Phase 4 success criteria
- `docker pull ghcr.io/datakb/datakb:latest` → works
- `pip install datakb-client` → works
- GCS storage backend: save + restore from version history
- S3 storage backend: same
- All 5 example notebooks load and run without errors (given real GCP credentials)
- Google OAuth login works end-to-end

---

## Open decisions (from spec §23)

| # | Question | Status |
|---|----------|--------|
| 1 | Project / package name on PyPI and GitHub | `[ ]` Pending |
| 2 | Cloud Run multi-instance kernel problem | `[ ]` Document `--max-instances 1` for v1 |
| 3 | Access token refresh inside long-running kernels | `[ ]` Pending |
| 4 | S3 credentials strategy (env vars vs instance profile) | `[ ]` Pending |
| 5 | Notebook output size — strip on autosave? | `[ ]` Pending |
| 6 | Concurrent edit — last-write-wins + ConflictModal acceptable for v1? | `[x]` Yes — ConflictModal in Phase 2 |
| 7 | Audit log table — add to schema from day one | `[ ]` Add in Phase 1 migration |
| 8 | Plugin interface for resource types — open enum vs plugin registry | `[ ]` Pending |

---

## Key files (references/)

| File | Purpose |
|------|---------|
| `references/spec.md` | Full system specification v4 (canonical) |
| `references/openapi.yaml` | OpenAPI 3.1 spec — all 39 endpoints, 39 schemas |
| `references/ui-design.html` | Interactive UI design — open in browser |
