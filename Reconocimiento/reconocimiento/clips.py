from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger("reconocimiento")


@dataclass
class _ActiveClip:
    writer: cv2.VideoWriter
    path: Path
    until: float
    size: tuple[int, int]


class ClipRecorder:
    """Guarda ~2 s antes y ~2 s después de un evento en un MP4."""

    def __init__(self, pre_s: float, post_s: float, fps: float) -> None:
        self.pre_s = pre_s
        self.post_s = post_s
        self.fps = max(6.0, fps)
        self._interval = 1.0 / self.fps
        self._last_push = 0.0
        self._buffer: deque[tuple[float, bytes]] = deque()
        self._active: list[_ActiveClip] = []

    def push(self, frame: np.ndarray, now: float) -> None:
        if now - self._last_push < self._interval:
            return
        self._last_push = now
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        if ok:
            self._buffer.append((now, encoded.tobytes()))
        cutoff = now - self.pre_s
        while self._buffer and self._buffer[0][0] < cutoff:
            self._buffer.popleft()
        self._write_live(frame, now)

    def start(self, path: Path, frame: np.ndarray, now: float) -> Optional[Path]:
        h, w = frame.shape[:2]
        writer, out_path = _open_writer(path, self.fps, (w, h))
        if writer is None:
            log.warning("No se pudo crear el clip de video.")
            return None
        for _, jpeg in self._buffer:
            decoded = cv2.imdecode(np.frombuffer(jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
            if decoded is None:
                continue
            if decoded.shape[1] != w or decoded.shape[0] != h:
                decoded = cv2.resize(decoded, (w, h))
            writer.write(decoded)
        writer.write(frame)
        self._active.append(_ActiveClip(writer, out_path, now + self.post_s, (w, h)))
        log.info("Clip iniciado: %s", out_path.name)
        return out_path

    def close(self) -> None:
        for clip in self._active:
            clip.writer.release()
        self._active.clear()

    def _write_live(self, frame: np.ndarray, now: float) -> None:
        still: list[_ActiveClip] = []
        h, w = frame.shape[:2]
        for clip in self._active:
            if now <= clip.until:
                out = frame if (w, h) == clip.size else cv2.resize(frame, clip.size)
                clip.writer.write(out)
                still.append(clip)
            else:
                clip.writer.release()
                log.info("Clip cerrado: %s", clip.path.name)
        self._active = still


def _open_writer(
    path: Path, fps: float, size: tuple[int, int]
) -> tuple[Optional[cv2.VideoWriter], Path]:
    w, h = size
    candidates = ((".mp4", "mp4v"), (".avi", "MJPG"))
    for suffix, codec in candidates:
        out = path.with_suffix(suffix)
        writer = cv2.VideoWriter(str(out), cv2.VideoWriter_fourcc(*codec), fps, (w, h))
        if writer.isOpened():
            return writer, out
        writer.release()
    return None, path
