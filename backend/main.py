"""
SyncSketch — backend/main.py

App factory: creates the FastAPI instance, configures middleware,
registers routers, and manages the DB connection lifecycle via lifespan.

Run with:
    uvicorn main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_tables, engine
from rooms import manager
from ws import router as ws_router

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────
    # Create tables if they don't exist yet (idempotent on every restart)
    await create_tables()

    yield   # server is running; handle requests

    # ── Shutdown ─────────────────────────────────────────────────────
    # Close all DB connections in the pool cleanly
    await engine.dispose()

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="SyncSketch", version="0.3.0", lifespan=lifespan)

# Allow the frontend served from any origin (file://, localhost:5500, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────
app.include_router(ws_router)


@app.get("/")
def health_check():
    return {
        "status": "ok",
        "service": "SyncSketch",
        "active_rooms": manager.active_rooms,
    }