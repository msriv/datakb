# CLAUDE.md — DataKB Project Instructions

This file contains standing instructions for Claude Code when working on the DataKB project.
Read this at the start of every new conversation before doing anything else.

---

## 1. Always read references/ first

At the start of every new conversation, read the `references/` directory to load project context:

```
references/
├── spec.md          ← Full system specification (canonical — read this first)
├── openapi.yaml     ← OpenAPI 3.1 spec for all API endpoints and schemas
├── ui-design.html   ← First-pass UI design mock (reference only — see note below)
├── spec-v1.md       ← Initial spec draft (historical only)
├── spec-v2.md       ← v2 spec draft (historical only)
└── spec-v3.md       ← v3 spec draft (historical only)
```

The canonical documents are `spec.md` and `openapi.yaml`. The versioned specs (v1–v3) are kept for historical reference only — do not implement from them.

Key sections in `spec.md` to orient yourself:

- **§3 Design Decisions Log** — locked architectural decisions, do not deviate without updating the spec
- **§5 System Architecture** — component layout and request flows
- **§6 Component Specifications** — detailed implementation specs for each module
- **§14 Database Schema** — full SQL schema, authoritative for all DB work
- **§15 API Reference** — maps to `openapi.yaml`
- **§17 Repository Structure** — where every file should live
- **§18 Docker Image Specification** — multi-stage build strategy
- **§20 Error Handling & Edge Cases** — every failure scenario with defined behaviour
- **§21 Frontend Component Tree** — full React hierarchy
- **§22 Contributing Guide** — plugin interfaces for storage adapters and resource types

---

## 2. UI design reference (ui-design.html)

`references/ui-design.html` is a **first-pass interactive mock** of the DataKB frontend. Open it in a browser to get a feel for the intended look, layout, and interactions.

**What it's good for:**
- Understanding the general visual direction (dark terminal aesthetic, JetBrains Mono + Syne fonts)
- Seeing how the three main views relate — graph canvas, notebook editor, settings
- Getting a sense of node type colour coding, the detail panel layout, and the cell editor structure
- Reference for component naming and rough information hierarchy

**What it's not:**
- It is not a pixel-perfect spec — do not treat measurements, spacing, or exact colours as requirements
- It does not need to be followed strictly — use your judgement when implementing the real React frontend
- It was built as a static HTML prototype, not production React code; component structure will differ
- Some interactions (e.g. the "add node" modal) are stubs and intentionally incomplete

**The authoritative frontend spec is `spec.md §6.5` (Frontend — React) and `spec.md §21` (Frontend Component Tree).** When the mock and the spec disagree, follow the spec. When neither is prescriptive about a detail, use good engineering judgement and keep the dark terminal aesthetic consistent.

---

## 3. Use implementation_plan.md to track progress

`implementation_plan.md` is the single source of truth for what has been done and what remains.

**At the start of every work session:**
1. Read `implementation_plan.md`
2. Identify which phase is in progress
3. Confirm which tasks are `[ ]` (not started), `[~]` (in progress), or `[x]` (complete)

**After completing any task:**
- Update the checkbox: `[ ]` → `[x]`
- If a task is partially done or blocked: `[ ]` → `[~]` or `[!]`

**Status legend:**
```
[ ]  Not started
[~]  In progress
[x]  Complete
[!]  Blocked / needs a decision
```

**Do not skip ahead.** Complete Phase 1 fully before beginning Phase 2. The success criteria at the bottom of each phase section must all be met before moving on.

---

## 4. Keep everything in sync when scope changes

If any requirement, design decision, or implementation detail changes:

### 4a. Update implementation_plan.md
- Add, remove, or modify tasks to reflect the new scope
- Add a note under the affected phase explaining what changed and why
- If a new open decision arises, add it to the **Open decisions** table at the bottom

### 4b. Update the relevant document in references/
- If the change affects the system architecture, API, data model, or component design → update `references/spec.md` in the relevant section
- If the change affects any API endpoint, request/response schema, or error code → update `references/openapi.yaml`
- If a previously locked design decision (§3 of spec) changes → update the **Design Decisions Log** table with the new choice and rationale
- Treat `references/spec.md` as a living document — it should always reflect the current agreed design, not what was originally planned

### 4c. Never leave documents inconsistent
- The spec and the implementation plan must always agree
- If you implement something that deviates from the spec (even for a good reason), update the spec immediately — do not leave the spec describing something different from what was built

---

## 5. Project overview (quick reference)

**What:** DataKB is a self-hosted, open source knowledge graph for data engineering teams. Engineers document infrastructure (services, pipelines, databases, Redis instances) as nodes in a visual graph. Each node can have an executable Jupyter notebook attached. Any authenticated user can run the notebook against real GCP infrastructure from their browser — no local setup required.

**Architecture:** Single Docker container. FastAPI backend + embedded Jupyter Server + React frontend (served as static files). Notebooks stored in a pluggable storage backend (local / GCS / S3).

**Key design decisions (locked):**
- Embedded Jupyter Server (not JupyterHub)
- Pluggable storage: local → GCS → S3 via `STORAGE_BACKEND` env var
- Anyone authenticated can run any notebook (no per-node run permissions)
- One kernel per user per notebook (isolated sessions)
- Auto-save every 60s + explicit named snapshots
- SQLite (default) / PostgreSQL (production) — same schema

**Stack:**
- Backend: Python 3.12, FastAPI, SQLAlchemy (async), Alembic
- Frontend: React 18, TypeScript, React Flow, CodeMirror 6, TailwindCSS, Vite
- Client library: `datakb-client` on PyPI
- Deployment: Docker Compose (local), Cloud Run + Cloud SQL (GCP)

**Monorepo layout:**
```
backend/    FastAPI app
frontend/   React app
client/     datakb-client PyPI package
deploy/     Docker Compose, nginx, GCP scripts
examples/   5 pre-built .ipynb notebooks
docs/       MkDocs documentation site
```

---

## 6. Do not do these things

- Do not install or configure JupyterHub — the spec uses Jupyter Server (the underlying engine), not JupyterHub
- Do not use `localStorage` or `sessionStorage` for the JWT — store it in memory only (refresh token in httpOnly cookie)
- Do not return SA key file contents in any API response
- Do not hardcode GCP project IDs or SA emails — all GCP config comes from the DB (configured via the UI)
- Do not skip the error handling cases in `spec.md §20` — they must be implemented alongside the happy path
- Do not change a locked design decision (§3) without updating both `implementation_plan.md` and `references/spec.md`
- Do not treat `references/ui-design.html` as a strict pixel spec — it is a directional mock, not a requirement
