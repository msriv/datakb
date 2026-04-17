import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth.middleware import get_current_user, require_editor
from db.engine import get_db
from db.models import Edge, KernelSession, Node, User

router = APIRouter(prefix="/api", tags=["graph"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class NodeResponse(BaseModel):
    id: str
    title: str
    type: str
    team: str | None
    description: str | None
    tags: list[str]
    notebook_path: str | None
    gcp_project_id: str | None
    sa_id: str | None
    resource_bindings: list[str]
    created_by: str
    created_at: str
    updated_at: str
    last_run_at: str | None
    last_run_by: str | None
    is_archived: bool
    active_kernel_count: int = 0

    model_config = {"from_attributes": True}


class EdgeResponse(BaseModel):
    id: str
    source_id: str
    target_id: str
    label: str
    created_by: str
    created_at: str

    model_config = {"from_attributes": True}


class GraphResponse(BaseModel):
    nodes: list[NodeResponse]
    edges: list[EdgeResponse]


class CreateNodeRequest(BaseModel):
    title: str
    type: str
    team: str | None = None
    description: str | None = None
    tags: list[str] = []
    notebook_path: str | None = None
    gcp_project_id: str | None = None
    sa_id: str | None = None
    resource_bindings: list[str] = []


class UpdateNodeRequest(BaseModel):
    title: str | None = None
    type: str | None = None
    team: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    notebook_path: str | None = None
    gcp_project_id: str | None = None
    sa_id: str | None = None
    resource_bindings: list[str] | None = None


class CreateEdgeRequest(BaseModel):
    source_id: str
    target_id: str
    label: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _node_to_response(node: Node, active_kernels: int = 0) -> NodeResponse:
    return NodeResponse(
        id=node.id,
        title=node.title,
        type=node.type,
        team=node.team,
        description=node.description,
        tags=json.loads(node.tags or "[]"),
        notebook_path=node.notebook_path,
        gcp_project_id=node.gcp_project_id,
        sa_id=node.sa_id,
        resource_bindings=json.loads(node.resource_bindings or "[]"),
        created_by=node.created_by,
        created_at=node.created_at,
        updated_at=node.updated_at,
        last_run_at=node.last_run_at,
        last_run_by=node.last_run_by,
        is_archived=bool(node.is_archived),
        active_kernel_count=active_kernels,
    )


def _edge_to_response(edge: Edge) -> EdgeResponse:
    return EdgeResponse(
        id=edge.id,
        source_id=edge.source_id,
        target_id=edge.target_id,
        label=edge.label,
        created_by=edge.created_by,
        created_at=edge.created_at,
    )


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/graph", response_model=GraphResponse)
async def get_graph(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    nodes_result = await db.execute(select(Node).where(Node.is_archived == 0))
    nodes = nodes_result.scalars().all()

    # Count active kernels per node
    kernel_counts_result = await db.execute(
        select(KernelSession.node_id, func.count(KernelSession.kernel_id))
        .where(KernelSession.is_active == 1)
        .group_by(KernelSession.node_id)
    )
    kernel_counts = {row[0]: row[1] for row in kernel_counts_result}

    edges_result = await db.execute(select(Edge))
    edges = edges_result.scalars().all()

    return GraphResponse(
        nodes=[_node_to_response(n, kernel_counts.get(n.id, 0)) for n in nodes],
        edges=[_edge_to_response(e) for e in edges],
    )


@router.get("/nodes/{node_id}", response_model=NodeResponse)
async def get_node(
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    kernel_count_result = await db.execute(
        select(func.count(KernelSession.kernel_id))
        .where(KernelSession.node_id == node_id, KernelSession.is_active == 1)
    )
    kernel_count = kernel_count_result.scalar() or 0
    return _node_to_response(node, kernel_count)


@router.post("/nodes", response_model=NodeResponse, status_code=201)
async def create_node(
    body: CreateNodeRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc).isoformat()
    node = Node(
        id=str(uuid.uuid4()),
        title=body.title,
        type=body.type,
        team=body.team,
        description=body.description,
        tags=json.dumps(body.tags),
        notebook_path=body.notebook_path,
        gcp_project_id=body.gcp_project_id,
        sa_id=body.sa_id,
        resource_bindings=json.dumps(body.resource_bindings),
        created_by=user.id,
        created_at=now,
        updated_at=now,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return _node_to_response(node)


@router.put("/nodes/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: str,
    body: UpdateNodeRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")

    if body.title is not None:
        node.title = body.title
    if body.type is not None:
        node.type = body.type
    if body.team is not None:
        node.team = body.team
    if body.description is not None:
        node.description = body.description
    if body.tags is not None:
        node.tags = json.dumps(body.tags)
    if body.notebook_path is not None:
        node.notebook_path = body.notebook_path
    if body.gcp_project_id is not None:
        node.gcp_project_id = body.gcp_project_id
    if body.sa_id is not None:
        node.sa_id = body.sa_id
    if body.resource_bindings is not None:
        node.resource_bindings = json.dumps(body.resource_bindings)

    node.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    await db.refresh(node)
    return _node_to_response(node)


@router.delete("/nodes/{node_id}", status_code=204)
async def delete_node(
    node_id: str,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if node is None:
        raise HTTPException(status_code=404, detail="Node not found")
    node.is_archived = 1
    node.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()


@router.post("/edges", response_model=EdgeResponse, status_code=201)
async def create_edge(
    body: CreateEdgeRequest,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    # Validate source and target nodes exist
    src = await db.execute(select(Node).where(Node.id == body.source_id))
    if src.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Source node not found")
    tgt = await db.execute(select(Node).where(Node.id == body.target_id))
    if tgt.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Target node not found")

    edge = Edge(
        id=str(uuid.uuid4()),
        source_id=body.source_id,
        target_id=body.target_id,
        label=body.label,
        created_by=user.id,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(edge)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Edge already exists between these nodes with the same label",
        )
    await db.refresh(edge)
    return _edge_to_response(edge)


@router.delete("/edges/{edge_id}", status_code=204)
async def delete_edge(
    edge_id: str,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Edge).where(Edge.id == edge_id))
    edge = result.scalar_one_or_none()
    if edge is None:
        raise HTTPException(status_code=404, detail="Edge not found")
    await db.delete(edge)
    await db.commit()
