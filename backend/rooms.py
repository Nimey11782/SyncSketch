"""
SyncSketch — backend/rooms.py

Room and RoomManager: in-memory state layer.

On first access, a room loads its persisted strokes from PostgreSQL so
state survives server restarts. From that point, strokes are kept in RAM
for fast reads; writes are handled in ws.py via the database CRUD helpers.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

from database import load_strokes

log = logging.getLogger("syncsketch")


@dataclass
class Room:
    """
    One collaborative whiteboard session.

    strokes : authoritative stroke list — mirrors the frontend's strokes[] array.
    clients : every currently-connected WebSocket in this room.
    """

    room_id: str
    strokes: list[dict[str, Any]] = field(default_factory=list)
    clients: set[WebSocket]       = field(default_factory=set)

    # ── Stroke helpers ────────────────────────────────────────────────
    def add_stroke(self, stroke: dict) -> None:
        self.strokes.append(stroke)

    def remove_stroke_by_id(self, stroke_id: str) -> bool:
        """Remove the stroke with the given id. Returns True if found."""
        for i, s in enumerate(self.strokes):
            if s.get("id") == stroke_id:
                self.strokes.pop(i)
                return True
        return False

    def clear(self) -> None:
        self.strokes.clear()

    # ── Client helpers ────────────────────────────────────────────────
    def join(self, ws: WebSocket) -> None:
        self.clients.add(ws)
        log.info("Room %-10s  +client  (%d total)", self.room_id, len(self.clients))

    def leave(self, ws: WebSocket) -> None:
        self.clients.discard(ws)
        log.info("Room %-10s  -client  (%d total)", self.room_id, len(self.clients))

    # ── Broadcast helpers ─────────────────────────────────────────────
    async def broadcast(self, message: dict, exclude: WebSocket | None = None) -> None:
        """Send a message to every client in the room except the sender."""
        dead: list[WebSocket] = []
        text = json.dumps(message)
        for ws in self.clients:
            if ws is exclude:
                continue
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def broadcast_user_count(self) -> None:
        await self.broadcast(
            {"type": "user_count", "payload": {"count": len(self.clients)}}
        )

    async def send_init(self, ws: WebSocket) -> None:
        """Send the full stroke list to a newly connected client."""
        await ws.send_text(
            json.dumps({"type": "init", "payload": {"strokes": self.strokes}})
        )

    async def send_user_count(self, ws: WebSocket) -> None:
        await ws.send_text(
            json.dumps({"type": "user_count", "payload": {"count": len(self.clients)}})
        )


class RoomManager:
    """
    Singleton that owns every active Room.
    Rooms are created lazily on first join and destroyed when empty.

    get_or_create is async because it may hit the DB on a cache miss
    (when the room is not yet in memory but has persisted strokes).
    """

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    async def get_or_create(self, room_id: str) -> Room:
        if room_id not in self._rooms:
            room = Room(room_id=room_id)
            # Load any previously persisted strokes from PostgreSQL
            room.strokes = await load_strokes(room_id)
            self._rooms[room_id] = room
            log.info(
                "Room %-10s  created  (loaded %d strokes from DB)",
                room_id, len(room.strokes),
            )
        return self._rooms[room_id]

    def maybe_destroy(self, room_id: str) -> None:
        """Remove the room from memory if no clients remain.
        Strokes are already persisted in DB — nothing is lost."""
        room = self._rooms.get(room_id)
        if room and not room.clients:
            del self._rooms[room_id]
            log.info("Room %-10s  evicted from memory (empty)", room_id)

    @property
    def active_rooms(self) -> list[str]:
        return list(self._rooms.keys())


# Single shared instance — imported by ws.py and main.py
manager = RoomManager()
