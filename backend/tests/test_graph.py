import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient

from auth.local import create_access_token, hash_password
from db.models import User


@pytest_asyncio.fixture
async def admin_user(db_session):
    now = datetime.now(timezone.utc).isoformat()
    user = User(
        id=str(uuid.uuid4()),
        email="admin@test.com",
        display_name="Admin",
        role="admin",
        password_hash=hash_password("password123"),
        created_at=now,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def admin_token(admin_user):
    return create_access_token(admin_user.id, admin_user.role)


@pytest.mark.asyncio
async def test_get_empty_graph(client: AsyncClient, admin_token: str):
    resp = await client.get("/api/graph", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["nodes"] == []
    assert data["edges"] == []


@pytest.mark.asyncio
async def test_create_node(client: AsyncClient, admin_token: str):
    resp = await client.post(
        "/api/nodes",
        json={"title": "Test Service", "type": "service", "team": "platform"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    node = resp.json()
    assert node["title"] == "Test Service"
    assert node["type"] == "service"
    assert node["team"] == "platform"
    assert node["is_archived"] is False


@pytest.mark.asyncio
async def test_create_and_delete_edge(client: AsyncClient, admin_token: str):
    auth = {"Authorization": f"Bearer {admin_token}"}

    n1 = (await client.post("/api/nodes", json={"title": "A", "type": "service"}, headers=auth)).json()
    n2 = (await client.post("/api/nodes", json={"title": "B", "type": "database"}, headers=auth)).json()

    edge_resp = await client.post(
        "/api/edges",
        json={"source_id": n1["id"], "target_id": n2["id"], "label": "reads_from"},
        headers=auth,
    )
    assert edge_resp.status_code == 201
    edge = edge_resp.json()

    graph = (await client.get("/api/graph", headers=auth)).json()
    assert len(graph["edges"]) == 1

    del_resp = await client.delete(f"/api/edges/{edge['id']}", headers=auth)
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_soft_delete_node(client: AsyncClient, admin_token: str):
    auth = {"Authorization": f"Bearer {admin_token}"}
    node = (await client.post("/api/nodes", json={"title": "ToDelete", "type": "note"}, headers=auth)).json()
    del_resp = await client.delete(f"/api/nodes/{node['id']}", headers=auth)
    assert del_resp.status_code == 204

    graph = (await client.get("/api/graph", headers=auth)).json()
    assert all(n["id"] != node["id"] for n in graph["nodes"])


@pytest.mark.asyncio
async def test_unauthorized_without_token(client: AsyncClient):
    resp = await client.get("/api/graph")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_viewer_cannot_create_node(client: AsyncClient, db_session):
    now = datetime.now(timezone.utc).isoformat()
    viewer = User(
        id=str(uuid.uuid4()),
        email="viewer@test.com",
        role="viewer",
        password_hash=hash_password("pw"),
        created_at=now,
    )
    db_session.add(viewer)
    await db_session.commit()

    token = create_access_token(viewer.id, viewer.role)
    resp = await client.post(
        "/api/nodes",
        json={"title": "Forbidden", "type": "service"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
