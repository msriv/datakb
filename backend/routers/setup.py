"""First-run setup wizard endpoints."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth.local import hash_password
from db.engine import get_db
from db.models import Edge, Node, User

router = APIRouter(prefix="/api/setup", tags=["setup"])


class SetupStatusResponse(BaseModel):
    first_run: bool


class CreateAdminRequest(BaseModel):
    email: str
    display_name: str
    password: str


class SeedDataRequest(BaseModel):
    load_examples: bool = True


@router.get("/status", response_model=SetupStatusResponse)
async def setup_status(request: Request):
    return SetupStatusResponse(first_run=getattr(request.app.state, "first_run", False))


@router.post("/admin", status_code=201)
async def create_admin(
    body: CreateAdminRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if not getattr(request.app.state, "first_run", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup already complete")

    now = datetime.now(timezone.utc).isoformat()
    admin = User(
        id=str(uuid.uuid4()),
        email=body.email,
        display_name=body.display_name,
        role="admin",
        password_hash=hash_password(body.password),
        created_at=now,
    )
    db.add(admin)
    await db.commit()
    request.app.state.first_run = False
    return {"message": "Admin account created", "user_id": admin.id}


@router.post("/seed")
async def seed_data(
    body: SeedDataRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if getattr(request.app.state, "first_run", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Create admin first")

    if not body.load_examples:
        return {"message": "Skipped example data"}

    from sqlalchemy import select
    result = await db.execute(select(User).limit(1))
    admin = result.scalar_one_or_none()
    if admin is None:
        raise HTTPException(status_code=400, detail="No users found")

    now = datetime.now(timezone.utc).isoformat()
    nodes_data = [
        {"id": str(uuid.uuid4()), "title": "Auth Service", "type": "service", "team": "platform",
         "description": "Core authentication service handling login and JWT issuance.", "tags": ["auth", "jwt", "platform"]},
        {"id": str(uuid.uuid4()), "title": "Auth Redis Cache", "type": "redis", "team": "platform",
         "description": "Redis cache for session tokens. TTL: 24h. Eviction: allkeys-lru.", "tags": ["redis", "cache", "auth"]},
        {"id": str(uuid.uuid4()), "title": "User Events Pipeline", "type": "pipeline", "team": "data",
         "description": "Kafka-to-BigQuery pipeline that processes user events.", "tags": ["kafka", "bigquery", "pipeline"]},
        {"id": str(uuid.uuid4()), "title": "Analytics BigQuery Dataset", "type": "database", "team": "data",
         "description": "Main analytics dataset in BigQuery. Updated hourly by the pipeline.", "tags": ["bigquery", "analytics"]},
        {"id": str(uuid.uuid4()), "title": "User Sessions Schema", "type": "schema", "team": "platform",
         "description": "Schema definition for user session events.", "tags": ["schema", "sessions"]},
    ]

    node_ids = {}
    for nd in nodes_data:
        node = Node(
            id=nd["id"],
            title=nd["title"],
            type=nd["type"],
            team=nd["team"],
            description=nd["description"],
            tags=json.dumps(nd["tags"]),
            resource_bindings="[]",
            created_by=admin.id,
            created_at=now,
            updated_at=now,
        )
        db.add(node)
        node_ids[nd["title"]] = nd["id"]

    edges_data = [
        (node_ids["Auth Service"], node_ids["Auth Redis Cache"], "reads_from"),
        (node_ids["Auth Service"], node_ids["User Sessions Schema"], "produces"),
        (node_ids["User Events Pipeline"], node_ids["Analytics BigQuery Dataset"], "writes_to"),
        (node_ids["User Events Pipeline"], node_ids["User Sessions Schema"], "consumes"),
    ]

    for src, tgt, label in edges_data:
        edge = Edge(
            id=str(uuid.uuid4()),
            source_id=src,
            target_id=tgt,
            label=label,
            created_by=admin.id,
            created_at=now,
        )
        db.add(edge)

    await db.commit()
    return {"message": "Example data loaded", "nodes": len(nodes_data), "edges": len(edges_data)}
