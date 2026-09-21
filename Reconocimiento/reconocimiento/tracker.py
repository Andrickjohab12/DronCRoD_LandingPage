from __future__ import annotations

import time
from dataclasses import dataclass, field

from .config import Settings
from .detections import Detection


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix1, iy1 = max(ax, bx), max(ay, by)
    ix2, iy2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _center_in_box(px: float, py: float, box: tuple[int, int, int, int]) -> bool:
    x, y, w, h = box
    return x <= px <= x + w and y <= py <= y + h


@dataclass
class Track:
    id: int
    x: int
    y: int
    w: int
    h: int
    confidence: float
    hits: int = 1
    last_seen: float = field(default_factory=time.time)
    confirmed: bool = False
    event_emitted: bool = False

    identity: str | None = None
    identity_score: float = 0.0
    identity_emitted: bool = False

    @property
    def box(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.w, self.h

    def to_detection(self) -> Detection:
        return Detection(
            "persona",
            self.x,
            self.y,
            self.w,
            self.h,
            self.confidence,
            self.id,
            self.identity,
            self.identity_score,
        )

    def apply_identity(self, name: str | None, score: float) -> None:
        if not name:
            return
        if self.identity is None or score >= self.identity_score:
            self.identity = name
            self.identity_score = score


class IoUTracker:
    """Asigna un ID estable a cada persona mientras permanece en escena."""

    def __init__(self, settings: Settings) -> None:
        self.min_hits = settings.track_min_hits
        self.max_missing_s = settings.track_max_missing_s
        self.iou_threshold = settings.track_iou
        self._next_id = 1
        self.tracks: list[Track] = []

    def update(self, detections: list[Detection]) -> tuple[list[Detection], list[Track], list[Track]]:
        now = time.time()
        people = [d for d in detections if d.label == "persona"]
        faces = [d for d in detections if d.label == "rostro"]
        faces_as_people = False
        if not people and faces:
            people = faces
            faces_as_people = True

        matched_tracks: set[int] = set()
        matched_dets: set[int] = set()
        pairs: list[tuple[float, int, int]] = []
        for ti, track in enumerate(self.tracks):
            for di, det in enumerate(people):
                score = _iou(track.box, det.box)
                if score >= self.iou_threshold:
                    pairs.append((score, ti, di))
        pairs.sort(reverse=True)

        for _, ti, di in pairs:
            if ti in matched_tracks or di in matched_dets:
                continue
            det = people[di]
            track = self.tracks[ti]
            track.x, track.y, track.w, track.h = det.box
            track.confidence = det.confidence
            track.hits += 1
            track.last_seen = now
            track.apply_identity(det.identity, det.identity_score)
            if track.hits >= self.min_hits:
                track.confirmed = True
            matched_tracks.add(ti)
            matched_dets.add(di)

        for di, det in enumerate(people):
            if di in matched_dets:
                continue
            self.tracks.append(
                Track(
                    id=self._next_id,
                    x=det.x,
                    y=det.y,
                    w=det.w,
                    h=det.h,
                    confidence=det.confidence,
                    last_seen=now,
                    identity=det.identity,
                    identity_score=det.identity_score,
                )
            )
            self._next_id += 1

        self.tracks = [t for t in self.tracks if now - t.last_seen <= self.max_missing_s]

        labeled: list[Detection] = []

        if not faces_as_people:
            for face in faces:
                cx = face.x + face.w / 2
                cy = face.y + face.h / 2
                owner = None
                for track in self.tracks:
                    if _center_in_box(cx, cy, track.box):
                        owner = track.id
                        track.apply_identity(face.identity, face.identity_score)
                        break
                labeled.append(
                    Detection(
                        "rostro",
                        face.x,
                        face.y,
                        face.w,
                        face.h,
                        face.confidence,
                        owner,
                        face.identity,
                        face.identity_score,
                        face.landmarks,
                    )
                )

        new_events = [t for t in self.tracks if t.confirmed and not t.event_emitted]
        for track in new_events:
            track.event_emitted = True
            if track.identity:
                track.identity_emitted = True

        identity_events = [
            t for t in self.tracks if t.confirmed and t.identity and not t.identity_emitted
        ]
        for track in identity_events:
            track.identity_emitted = True

        for track in self.tracks:
            if track.confirmed:
                labeled.append(track.to_detection())

        return labeled, new_events, identity_events
