from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence


@dataclass(slots=True)
class Detection:
    label: str
    x: int
    y: int
    w: int
    h: int
    confidence: float
    track_id: int | None = None
    identity: str | None = None
    identity_score: float = 0.0
    landmarks: tuple[float, ...] | None = None

    @property
    def box(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.w, self.h


def clip_box(x: int, y: int, w: int, h: int, frame_w: int, frame_h: int) -> tuple[int, int, int, int]:
    x = max(0, x)
    y = max(0, y)
    w = max(1, min(w, frame_w - x))
    h = max(1, min(h, frame_h - y))
    return x, y, w, h


def count_by_label(detections: Sequence[Detection], label: str) -> int:
    return sum(1 for item in detections if item.label == label)


def has_human(detections: Iterable[Detection]) -> bool:
    return any(item.label in {"persona", "rostro"} for item in detections)
