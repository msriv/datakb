from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from db.engine import async_session_factory, engine
from routers import auth, graph, health, setup

import logging

logging.basicConfig(level="INFO")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run Alembic migrations on startup
    logger.info("Running database migrations...")
    alembic_cfg = AlembicConfig("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations complete.")

    # Check if any users exist — if not, set first-run flag
    async with async_session_factory() as db:
        from db.models import User
        result = await db.execute(select(User).limit(1))
        user = result.scalar_one_or_none()
        app.state.first_run = user is None

    yield

    # Cleanup on shutdown
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="DataKB",
        description="Self-hosted executable knowledge graph for data engineering teams",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(graph.router)
    app.include_router(health.router)
    app.include_router(setup.router)

    # Serve static frontend — must be last
    import os
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    if os.path.isdir(static_dir):
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


app = create_app()
