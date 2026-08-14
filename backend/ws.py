"""
SyncSketch — backend/ws.py

WebSocket endpoint, message dispatch, and validation helpers.
Owns the /ws/{room_id} route; registered on the app via APIRouter.

DB writes happen here immediately after in-memory state is updated,
so memory and DB are always consistent.

Message protocol
────────────────
Client → Server:
  stroke          { stroke: StrokeElement }       finished stroke
  stroke_progress { id, tool, color, size, point } live point (ephemeral, NOT persisted)
  undo            { id: str }                      remove stroke by id
  clear           {}                               wipe canvas

Server → Client:
  init            { strokes: list }               full state on connect
  stroke          { stroke: StrokeElement }        relayed completed stroke
  stroke_progress { ... }                          relayed live point
  undo            { id: str }                      relayed undo
  clear           {}                               relayed clear
  user_count      { count: int }                   live peer count
  error           { message: str }                 protocol / validation error
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from db import clear_room, delete_stroke, save_stroke
from rooms import manager

log = logging.getLogger("syncsketch")
router = APIRouter()


# ─── Validation ───────────────────────────────────────────────────────────────

def _validate_stroke(stroke: Any) -> str | None:
    """Returns an error string if the stroke is malformed, else None."""
    if not isinstance(stroke, dict):
        return "stroke must be an object"
    if stroke.get("tool") not in ("pencil", "eraser"):
        return "stroke.tool must be 'pencil' or 'eraser'"
    if not isinstance(stroke.get("points"), list):
        return "stroke.points must be an array"
    if not isinstance(stroke.get("id"), str) or not stroke["id"]:
        return "stroke.id must be a non-empty string"
    return None


async def _send_error(ws: WebSocket, message: str) -> None:
    await ws.send_text(
        json.dumps({"type": "error", "payload": {"message": message}})
    )


# ─── WebSocket endpoint ───────────────────────────────────────────────────────

@router.websocket("/ws/{room_id}")
async def ws_endpoint(websocket: WebSocket, room_id: str) -> None:
    await websocket.accept()

    # get_or_create is now async — loads persisted strokes from DB on cache miss
    room = await manager.get_or_create(room_id)
    room.join(websocket)

    try:
        # Send full canvas state (from memory, already loaded from DB)
        await room.send_init(websocket)

        # Tell everyone the updated peer count
        await room.broadcast_user_count()
        await room.send_user_count(websocket)

        # ── Message loop ──────────────────────────────────────────────
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await _send_error(websocket, "Invalid JSON")
                continue

            msg_type = msg.get("type")
            payload  = msg.get("payload", {})

            # ── stroke (completed) ────────────────────────────────────
            if msg_type == "stroke":
                stroke = payload.get("stroke")
                err = _validate_stroke(stroke)
                if err:
                    await _send_error(websocket, err)
                    continue

                # 1. Update in-memory state
                room.add_stroke(stroke)
                # 2. Persist to DB
                await save_stroke(room_id, stroke)
                # 3. Broadcast to other clients
                await room.broadcast(
                    {"type": "stroke", "payload": {"stroke": stroke}},
                    exclude=websocket,
                )
                log.debug("Room %-10s  stroke %s (%d pts)",
                          room_id, stroke["id"], len(stroke["points"]))

            # ── stroke_progress (ephemeral — NOT persisted) ───────────
            elif msg_type == "stroke_progress":
                stroke_id = payload.get("id")
                point     = payload.get("point")
                if not isinstance(stroke_id, str) or not isinstance(point, dict):
                    await _send_error(websocket, "stroke_progress needs id and point")
                    continue

                await room.broadcast(
                    {"type": "stroke_progress", "payload": payload},
                    exclude=websocket,
                )

            # ── undo ──────────────────────────────────────────────────
            elif msg_type == "undo":
                stroke_id = payload.get("id")
                if not isinstance(stroke_id, str):
                    await _send_error(websocket, "undo payload must have id: string")
                    continue

                # 1. Update in-memory state
                if room.remove_stroke_by_id(stroke_id):
                    # 2. Persist to DB
                    await delete_stroke(stroke_id)
                    # 3. Broadcast to other clients
                    await room.broadcast(
                        {"type": "undo", "payload": {"id": stroke_id}},
                        exclude=websocket,
                    )
                    log.debug("Room %-10s  undo %s", room_id, stroke_id)

            # ── clear ─────────────────────────────────────────────────
            elif msg_type == "clear":
                # 1. Update in-memory state
                room.clear()
                # 2. Persist to DB
                await clear_room(room_id)
                # 3. Broadcast to other clients
                await room.broadcast(
                    {"type": "clear", "payload": {}},
                    exclude=websocket,
                )
                log.info("Room %-10s  cleared", room_id)

            else:
                await _send_error(websocket, f"Unknown message type: {msg_type!r}")

    except WebSocketDisconnect:
        pass
    finally:
        room.leave(websocket)
        await room.broadcast_user_count()
        manager.maybe_destroy(room_id)
