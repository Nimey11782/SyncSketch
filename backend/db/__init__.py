"""
SyncSketch — backend/db/__init__.py

Public API of the db package.
The rest of the application imports from here:

    from db import load_strokes, save_stroke, delete_stroke, clear_room
    from db import create_tables, engine

Nothing outside this package should import from db.engine, db.models,
or db.crud directly.
"""

from db.crud import clear_room, delete_stroke, load_strokes, save_stroke
from db.engine import engine
from db.models import Base


async def create_tables() -> None:
    """
    Create all tables that don't exist yet.
    Safe to call on every server startup — idempotent.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


__all__ = [
    # CRUD
    "load_strokes",
    "save_stroke",
    "delete_stroke",
    "clear_room",
    # Schema management
    "create_tables",
    # Engine (needed by main.py for disposal on shutdown)
    "engine",
]
