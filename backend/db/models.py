
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Shared declarative base — all models inherit from this."""
    pass


class StrokeRow(Base):

    __tablename__ = "strokes"

    id:         Mapped[str]      = mapped_column(Text, primary_key=True)
    room_id:    Mapped[str]      = mapped_column(Text, nullable=False, index=True)
    tool:       Mapped[str]      = mapped_column(Text, nullable=False)
    color:      Mapped[str]      = mapped_column(Text, nullable=False)
    size:       Mapped[float]    = mapped_column(Float, nullable=False)
    points:     Mapped[Any]      = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    def to_dict(self) -> dict:
        """Return the frontend-compatible stroke dict."""
        return {
            "id":     self.id,
            "tool":   self.tool,
            "color":  self.color,
            "size":   self.size,
            "points": self.points,
        }
