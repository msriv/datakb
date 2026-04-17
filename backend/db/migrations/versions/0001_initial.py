"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-17 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "gcp_projects",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), unique=True, nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("added_by", sa.String(), nullable=False),
        sa.Column("added_at", sa.String(), nullable=False),
    )

    op.create_table(
        "service_accounts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("gcp_project_id", sa.String(), sa.ForeignKey("gcp_projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sa_email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("credential_type", sa.String(), nullable=False),
        sa.Column("key_file_ref", sa.String(), nullable=True),
        sa.Column("added_by", sa.String(), nullable=False),
        sa.Column("added_at", sa.String(), nullable=False),
        sa.UniqueConstraint("gcp_project_id", "sa_email"),
        sa.CheckConstraint("credential_type IN ('key_file', 'workload_identity')"),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), unique=True, nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("role", sa.String(), nullable=False, server_default="viewer"),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("last_login_at", sa.String(), nullable=True),
        sa.CheckConstraint("role IN ('admin', 'editor', 'viewer')"),
    )

    op.create_table(
        "nodes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("team", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tags", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("notebook_path", sa.String(), nullable=True),
        sa.Column("gcp_project_id", sa.String(), sa.ForeignKey("gcp_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sa_id", sa.String(), sa.ForeignKey("service_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resource_bindings", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("last_run_at", sa.String(), nullable=True),
        sa.Column("last_run_by", sa.String(), nullable=True),
        sa.Column("is_archived", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_nodes_team", "nodes", ["team"])
    op.create_index("ix_nodes_type", "nodes", ["type"])

    op.create_table(
        "edges",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("source_id", sa.String(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_id", sa.String(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.UniqueConstraint("source_id", "target_id", "label"),
    )
    op.create_index("ix_edges_source_id", "edges", ["source_id"])
    op.create_index("ix_edges_target_id", "edges", ["target_id"])

    op.create_table(
        "resources",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), unique=True, nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("gcp_project_id", sa.String(), sa.ForeignKey("gcp_projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sa_id", sa.String(), sa.ForeignKey("service_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("config", sa.Text(), nullable=False),
        sa.Column("password_ref", sa.String(), nullable=True),
        sa.Column("added_by", sa.String(), nullable=False),
        sa.Column("added_at", sa.String(), nullable=False),
        sa.CheckConstraint("type IN ('bigquery', 'redis', 'gcs', 'http', 'tcp', 'custom')"),
    )

    op.create_table(
        "kernel_sessions",
        sa.Column("kernel_id", sa.String(), primary_key=True),
        sa.Column("node_id", sa.String(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.String(), nullable=False),
        sa.Column("last_active_at", sa.String(), nullable=False),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("node_id", "user_id", "is_active"),
    )
    op.create_index("ix_kernel_sessions_node_user", "kernel_sessions", ["node_id", "user_id"])

    op.create_table(
        "snapshots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("node_id", sa.String(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("ix_snapshots_node_id", "snapshots", ["node_id"])

    op.create_table(
        "autosaves",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("node_id", sa.String(), sa.ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("saved_at", sa.String(), nullable=False),
        sa.Column("saved_by", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("autosaves")
    op.drop_table("snapshots")
    op.drop_table("kernel_sessions")
    op.drop_table("resources")
    op.drop_table("edges")
    op.drop_table("nodes")
    op.drop_table("users")
    op.drop_table("service_accounts")
    op.drop_table("gcp_projects")
