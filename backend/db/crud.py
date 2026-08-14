
from __future__ import annotations

from sqlalchemy import delete, select

from db.engine import AsyncSessionLocal
from db.models import StrokeRow


async def load_strokes(room_id: str) -> list[dict]:
    """
    for someone joining the room with room_id we want to get all the strokes stored in db with that room_id 
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(StrokeRow)
            .where(StrokeRow.room_id == room_id)
            .order_by(StrokeRow.created_at)
        )
        return [row.to_dict() for row in result.scalars().all()]


async def save_stroke(room_id: str, stroke: dict) -> None:
    """Persist a single completed stroke. Called on every mouseup."""
    async with AsyncSessionLocal() as session:
        session.add(
            StrokeRow(
                id=stroke["id"],
                room_id=room_id,
                tool=stroke["tool"],
                color=stroke["color"],
                size=stroke["size"],
                points=stroke["points"],
            )
        )
        await session.commit()


async def delete_stroke(stroke_id: str) -> None:
    """Hard-delete a stroke by id. Called on undo."""
    async with AsyncSessionLocal() as session:
        row = await session.get(StrokeRow, stroke_id)
        if row:
            await session.delete(row)
            await session.commit()


async def clear_room(room_id: str) -> None:
    """Delete every stroke in a room. Called on canvas clear."""
    async with AsyncSessionLocal() as session:
        await session.execute(
            delete(StrokeRow).where(StrokeRow.room_id == room_id)
        )
        await session.commit()
