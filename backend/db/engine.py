"""
SyncSketch — backend/db/engine.py

Async SQLAlchemy engine and session factory.
Reads DATABASE_URL from the .env file via python-dotenv.

Nothing else in the codebase imports SQLAlchemy's engine machinery directly —
only this module does, keeping the DB driver swap to a single file change.
"""

import os

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]   # fail fast if not configured

# Render/Heroku provide URLs starting with postgres:// or postgresql://
# Our async driver needs postgresql+asyncpg://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# pool_pre_ping=True re-validates stale connections before use
engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

# expire_on_commit=False keeps ORM objects usable after session.commit()
AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, expire_on_commit=False
)
