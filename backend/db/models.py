from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from db.engine import Base


class Node(Base):
    __tablename__ = "nodes"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    type = Column(String, nullable=False)
    team = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(Text, nullable=False, default="[]")
    notebook_path = Column(String, nullable=True)

    gcp_project_id = Column(String, ForeignKey("gcp_projects.id", ondelete="SET NULL"), nullable=True)
    sa_id = Column(String, ForeignKey("service_accounts.id", ondelete="SET NULL"), nullable=True)
    resource_bindings = Column(Text, nullable=False, default="[]")

    created_by = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)
    last_run_at = Column(String, nullable=True)
    last_run_by = Column(String, nullable=True)
    is_archived = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("ix_nodes_team", "team"),
        Index("ix_nodes_type", "type"),
    )


class Edge(Base):
    __tablename__ = "edges"

    id = Column(String, primary_key=True)
    source_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    target_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    label = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "label"),
        Index("ix_edges_source_id", "source_id"),
        Index("ix_edges_target_id", "target_id"),
    )


class GCPProject(Base):
    __tablename__ = "gcp_projects"

    id = Column(String, primary_key=True)
    project_id = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=False)
    added_by = Column(String, nullable=False)
    added_at = Column(String, nullable=False)


class ServiceAccount(Base):
    __tablename__ = "service_accounts"

    id = Column(String, primary_key=True)
    gcp_project_id = Column(String, ForeignKey("gcp_projects.id", ondelete="CASCADE"), nullable=False)
    sa_email = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    credential_type = Column(String, nullable=False)
    key_file_ref = Column(String, nullable=True)
    added_by = Column(String, nullable=False)
    added_at = Column(String, nullable=False)

    __table_args__ = (
        UniqueConstraint("gcp_project_id", "sa_email"),
        CheckConstraint("credential_type IN ('key_file', 'workload_identity')"),
    )


class Resource(Base):
    __tablename__ = "resources"

    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    type = Column(String, nullable=False)
    display_name = Column(String, nullable=False)
    gcp_project_id = Column(String, ForeignKey("gcp_projects.id", ondelete="SET NULL"), nullable=True)
    sa_id = Column(String, ForeignKey("service_accounts.id", ondelete="SET NULL"), nullable=True)
    config = Column(Text, nullable=False)
    password_ref = Column(String, nullable=True)
    added_by = Column(String, nullable=False)
    added_at = Column(String, nullable=False)

    __table_args__ = (
        CheckConstraint("type IN ('bigquery', 'redis', 'gcs', 'http', 'tcp', 'custom')"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=True)
    role = Column(String, nullable=False, default="viewer")
    team = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    created_at = Column(String, nullable=False)
    last_login_at = Column(String, nullable=True)

    __table_args__ = (
        CheckConstraint("role IN ('admin', 'editor', 'viewer')"),
    )


class KernelSession(Base):
    __tablename__ = "kernel_sessions"

    kernel_id = Column(String, primary_key=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(String, nullable=False)
    last_active_at = Column(String, nullable=False)
    is_active = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        UniqueConstraint("node_id", "user_id", "is_active"),
        Index("ix_kernel_sessions_node_user", "node_id", "user_id"),
    )


class Snapshot(Base):
    __tablename__ = "snapshots"

    id = Column(String, primary_key=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    storage_path = Column(String, nullable=False)
    message = Column(String, nullable=False)
    created_by = Column(String, nullable=False)
    created_at = Column(String, nullable=False)

    __table_args__ = (Index("ix_snapshots_node_id", "node_id"),)


class Autosave(Base):
    __tablename__ = "autosaves"

    id = Column(String, primary_key=True)
    node_id = Column(String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False)
    storage_path = Column(String, nullable=False)
    saved_at = Column(String, nullable=False)
    saved_by = Column(String, nullable=False)
