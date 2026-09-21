from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Sequence

import cv2
import numpy as np

from .camera import VideoDevice, device_label
from .config import Settings
from .detections import Detection, count_by_label

CYAN = (214, 200, 80)
AMBER = (40, 170, 255)
WHITE = (245, 245, 245)
RED = (70, 70, 255)
GREEN = (90, 220, 140)
DIM = (180, 180, 180)
BLACK = (0, 0, 0)

FONT = cv2.FONT_HERSHEY_SIMPLEX
_ACCENTS = str.maketrans("áéíóúÁÉÍÓÚñÑüÜ", "aeiouAEIOUnNuU")


@dataclass
class HitRect:
    x: int
    y: int
    w: int
    h: int
    action: str
    index: int = -1

    def contains(self, px: int, py: int) -> bool:
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h


@dataclass
class HudLayout:
    hits: list[HitRect] = field(default_factory=list)
    picker_open: bool = False


@dataclass
class HudState:
    fps: float
    paused: bool
    flash: bool
    last_capture_name: str
    backend: str
    unique_people: int
    events: int
    uptime_s: float
    highlight_id: Optional[int] = None
    muted: bool = False
    enrolled: int = 0
    picker_open: bool = False
    cameras: list[VideoDevice] = field(default_factory=list)
    current_camera: int = 0
    camera_status: str = ""


def render(
    frame: np.ndarray,
    detections: Sequence[Detection],
    settings: Settings,
    state: HudState,
) -> tuple[np.ndarray, HudLayout]:
    vis = frame.copy()
    h, w = vis.shape[:2]
    layout = HudLayout(picker_open=state.picker_open)
    known = sorted({d.identity for d in detections if d.identity})

    for det in detections:
        color, tag = _tag_for(det, state.highlight_id)
        _draw_target(vis, det, color, tag)

    people = count_by_label(detections, "persona")
    faces = count_by_label(detections, "rostro")
    alert = people > 0 or faces > 0

    overlay = vis.copy()
    cv2.rectangle(overlay, (0, 0), (w, 64), BLACK, -1)
    cv2.rectangle(overlay, (0, h - 72), (w, h), BLACK, -1)
    cv2.addWeighted(overlay, 0.58, vis, 0.42, 0, vis)

    pulse = int(datetime.now().microsecond / 200_000) % 2
    live_color = RED if (not state.paused and pulse) else (80, 80, 80)
    cv2.circle(vis, (28, 32), 8, live_color if not state.paused else DIM, -1, cv2.LINE_AA)
    status = "PAUSA" if state.paused else "EN VIVO"
    _text(vis, status, (46, 38), 0.62, WHITE, 2)

    _text(vis, "RECONOCIMIENTO", (140, 38), 0.72, CYAN, 2)
    _text(vis, f"FPS {state.fps:4.1f}", (w - 540, 38), 0.5, WHITE, 1)
    _text(vis, state.backend, (w - 420, 38), 0.45, DIM, 1)

    count_color = GREEN if alert else DIM
    _text(vis, f"EN ESCENA {people}", (w - 320, 22), 0.45, count_color, 1)
    _text(vis, f"UNICOS {state.unique_people}  EVT {state.events}", (w - 320, 42), 0.45, CYAN, 1)
    _text(vis, f"GALERIA {state.enrolled}", (w - 320, 60), 0.42, DIM, 1)

    now = datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
    gps = f"{settings.latitude:.6f}, {settings.longitude:.6f}  ·  {settings.altitude_m:.1f} m"
    uptime = _fmt_uptime(state.uptime_s)
    _text(vis, now, (18, h - 42), 0.55, WHITE, 1)
    _text(vis, f"{settings.location_name}   sesion {uptime}", (18, h - 16), 0.5, CYAN, 1)
    _text(vis, gps, (w // 2 - 40, h - 16), 0.45, DIM, 1)

    help_l = "[Q] Salir  [S] Captura  [ESPACIO] Pausa  [G] Galeria  [R] Caras  [M] Audio  [C] Camara"
    _text(vis, help_l, (w - 640, h - 42), 0.4, DIM, 1)
    layout.hits.extend(_draw_camera_picker(vis, state))
    if state.camera_status:
        _text(vis, state.camera_status, (18, 118), 0.48, AMBER, 1)
    if state.muted:
        _text(vis, "AUDIO OFF", (w - 120, 38), 0.42, AMBER, 1)
    if state.last_capture_name:
        _text(vis, f"Ultimo evento: {state.last_capture_name}", (w - 560, h - 16), 0.4, GREEN, 1)

    if known and not state.paused:
        names = ", ".join(_hud(n.upper()) for n in known)
        _text(vis, f"IDENTIDAD: {names}", (18, 86), 0.62, GREEN, 2)
    elif state.highlight_id is not None and not state.paused:
        _text(vis, f"NUEVO OBJETIVO #{state.highlight_id}", (18, 86), 0.62, RED, 2)
    elif alert and not state.paused:
        cv2.rectangle(vis, (0, 64), (6, h - 72), RED, -1)
        _text(vis, "HUMANO EN ESCENA", (18, 86), 0.52, RED, 2)

    if state.flash:
        vis = cv2.addWeighted(vis, 0.72, np.full_like(vis, 255), 0.28, 0)

    return vis, layout


def _draw_camera_picker(vis: np.ndarray, state: HudState) -> list[HitRect]:
    hits: list[HitRect] = []
    h, w = vis.shape[:2]
    bw, bh = 200, 40
    if w >= 1100:
        x, y = 420, 10
    else:
        x, y = 12, 70
    cv2.rectangle(vis, (x, y), (x + bw, y + bh), (28, 42, 52), -1)
    cv2.rectangle(vis, (x, y), (x + bw, y + bh), CYAN, 1)
    arrow = "x" if state.picker_open else "v"
    _text(vis, f"CAMARA #{state.current_camera} {arrow}", (x + 10, y + 25), 0.48, WHITE, 1)
    hits.append(HitRect(x, y, bw, bh, "toggle"))

    if not state.picker_open:
        return hits

    panel_x, panel_y = x, y + bh + 8
    row_h = 44
    rows = state.cameras or []
    empty = not rows
    height = row_h * (len(rows) if rows else 1) + 10
    panel_w = min(520, max(360, w - panel_x - 16))
    cv2.rectangle(vis, (panel_x, panel_y), (panel_x + panel_w, panel_y + height), (12, 20, 28), -1)
    cv2.rectangle(vis, (panel_x, panel_y), (panel_x + panel_w, panel_y + height), CYAN, 1)
    if empty:
        _text(vis, "No se detectaron camaras", (panel_x + 12, panel_y + 26), 0.45, DIM, 1)
        return hits

    for i, cam in enumerate(rows):
        ry = panel_y + 5 + i * row_h
        active = cam.index == state.current_camera
        if active:
            cv2.rectangle(vis, (panel_x + 4, ry), (panel_x + panel_w - 4, ry + row_h - 4), (36, 70, 58), -1)
        label = device_label(cam)
        if len(label) > 42:
            label = label[:41] + "."
        color = GREEN if active else WHITE
        _text(vis, label, (panel_x + 12, ry + 24), 0.45, color, 1)
        hits.append(HitRect(panel_x, ry, panel_w, row_h, "select", cam.index))
    return hits


def _tag_for(det: Detection, highlight_id: Optional[int]) -> tuple[tuple[int, int, int], str]:
    if det.identity:
        score = f"  {det.identity_score * 100:.0f}%"
        return GREEN, f"{_hud(det.identity.upper())}{score}"
    if det.track_id is not None and det.track_id == highlight_id:
        color = RED
    elif det.label == "persona":
        color = CYAN
    else:
        color = AMBER
    if det.label == "persona":
        tag = f"OBJ #{det.track_id}" if det.track_id is not None else "PERSONA"
    else:
        tag = "DESCONOCIDO"
        if det.track_id is not None:
            tag = f"{tag} #{det.track_id}"
    return color, f"{tag}  {det.confidence * 100:.0f}%"


def _fmt_uptime(seconds: float) -> str:
    total = max(0, int(seconds))
    hh, rem = divmod(total, 3600)
    mm, ss = divmod(rem, 60)
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def _draw_target(img: np.ndarray, det: Detection, color: tuple[int, int, int], label: str) -> None:
    x, y, w, h = det.box
    x2, y2 = x + w, y + h
    corner = max(12, min(w, h) // 5)
    thickness = 2

    cv2.rectangle(img, (x, y), (x2, y2), color, 1)
    cv2.line(img, (x, y), (x + corner, y), color, thickness)
    cv2.line(img, (x, y), (x, y + corner), color, thickness)
    cv2.line(img, (x2, y), (x2 - corner, y), color, thickness)
    cv2.line(img, (x2, y), (x2, y + corner), color, thickness)
    cv2.line(img, (x, y2), (x + corner, y2), color, thickness)
    cv2.line(img, (x, y2), (x, y2 - corner), color, thickness)
    cv2.line(img, (x2, y2), (x2 - corner, y2), color, thickness)
    cv2.line(img, (x2, y2), (x2, y2 - corner), color, thickness)

    (tw, th), _ = cv2.getTextSize(label, FONT, 0.5, 1)
    pad_y = max(0, y - th - 12)
    cv2.rectangle(img, (x, pad_y), (x + tw + 10, pad_y + th + 10), color, -1)
    cv2.putText(img, label, (x + 5, pad_y + th + 4), FONT, 0.5, BLACK, 1, cv2.LINE_AA)


def _hud(text: str) -> str:
    return text.translate(_ACCENTS)


def _text(img: np.ndarray, text: str, org: tuple[int, int], scale: float, color, thickness: int) -> None:
    cv2.putText(img, _hud(text), org, FONT, scale, color, thickness, cv2.LINE_AA)
