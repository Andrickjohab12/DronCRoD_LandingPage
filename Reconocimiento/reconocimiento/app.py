from __future__ import annotations

import logging
import queue
import threading
import time
import uuid
import webbrowser
from typing import Optional

import cv2
import numpy as np

from .alerts import notify_new_target
from .camera import CameraStream, VideoDevice, device_kind, picker_devices, windows_device_names
from .capture import CaptureStore
from .clips import ClipRecorder
from .config import Settings
from .detector import HumanDetector, ThreadedDetector
from .gallery import rebuild_gallery
from .hud import CYAN, DIM, WHITE, HudLayout, HudState, render
from .stream import StreamServer
from .tracker import IoUTracker

log = logging.getLogger("reconocimiento")

WINDOW_NAME = "RECONOCIMIENTO"


class RecognitionApp:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session_id = uuid.uuid4().hex[:8]
        self.detector: Optional[HumanDetector] = None
        self.async_detector: Optional[ThreadedDetector] = None
        self.camera: Optional[CameraStream] = None
        self.store = CaptureStore(settings, self.session_id)
        self.tracker = IoUTracker(settings)
        self.clips = ClipRecorder(settings.clip_pre_s, settings.clip_post_s, settings.clip_fps)
        self.unique_ids: set[int] = set()
        self.events = 0
        self.started = time.time()
        self.sound_on = settings.enable_sound
        self._click: Optional[tuple[int, int]] = None
        self._picker_open = False
        self._cameras = []
        self._camera_status = ""
        self._status_until = 0.0
        self._stop = threading.Event()
        self._stream: Optional[StreamServer] = None
        self._fps = 0.0
        self._phase = "starting"
        self._people = 0
        self._identities = 0
        self._paused = False
        self._commands: queue.Queue = queue.Queue()
        self._last_vis: Optional[np.ndarray] = None
        self._last_labeled = []
        self._last_capture_name = ""

    def run(self) -> None:
        if self.settings.stream_port:
            self._stream = StreamServer(self, self.settings.stream_port)
            self._stream.start()

        if not self.settings.headless:
            cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
            cv2.resizeWindow(WINDOW_NAME, 1280, 720)
            _show_status("Iniciando sistema...", "Cargando detectores YOLO / YuNet")
            cv2.waitKey(1)
        self._announce("Iniciando sistema...", "Cargando detectores YOLO / YuNet")

        log.info("Sesión %s · cargando modelos", self.session_id)
        self._phase = "models"
        self.detector = HumanDetector(self.settings)
        self.async_detector = ThreadedDetector(self.detector)
        if self.settings.source_kind == "goggles":
            self._announce("Abriendo goggles...", "HDMI capture · Fat Shark / Avatar HD")
        elif self.settings.source_kind == "analog":
            self._announce("Abriendo receptor...", "SkyDroid 5.8G OTG · analogico USB")
        else:
            self._announce("Abriendo cámara...", "DirectShow · hilo de captura")
        if not self.settings.headless:
            cv2.waitKey(1)

        self._phase = "camera"
        self.camera = CameraStream(self.settings)
        try:
            self._cameras = picker_devices(self.camera.device)
        except Exception:
            self._cameras = [self.camera.device]
        rebuild_gallery()
        if not self.settings.headless:
            cv2.setMouseCallback(WINDOW_NAME, self._on_mouse)
        self._phase = "ready"
        self._loop()

    def _loop(self) -> None:
        assert self.detector is not None
        assert self.async_detector is not None
        assert self.camera is not None

        frozen: Optional[np.ndarray] = None
        flash_until = 0.0
        highlight_until = 0.0
        highlight_id: Optional[int] = None
        last_name = ""
        labeled = []
        last_seq = -1

        fps = 0.0
        fps_frames = 0
        fps_t0 = time.perf_counter()

        log.info("Listo. Q salir · S captura · C camara · G galería · R caras · M audio · ESPACIO pausa.")

        try:
            while not self._stop.is_set():
                self._drain_commands()
                now = time.time()
                new_targets = []
                identified = []
                if not self._paused:
                    ok, frame = self.camera.read()
                    if not ok or frame is None:
                        time.sleep(0.02)
                        continue
                    frozen = frame
                    self.async_detector.submit(frame)
                    raw, seq = self.async_detector.latest()
                    if seq != last_seq:
                        labeled, new_targets, identified = self.tracker.update(raw)
                        last_seq = seq
                    self.clips.push(frame, now)
                else:
                    if frozen is None:
                        time.sleep(0.02)
                        continue
                    frame = frozen

                if new_targets:
                    highlight_id = new_targets[-1].id
                    highlight_until = now + 2.4

                enrolled = 0
                if self.detector.identity is not None:
                    enrolled = len(self.detector.identity.names())
                hud = HudState(
                    fps=fps,
                    paused=self._paused,
                    flash=now < flash_until,
                    last_capture_name=last_name,
                    backend=self.async_detector.backend,
                    unique_people=len(self.unique_ids),
                    events=self.events,
                    uptime_s=now - self.started,
                    highlight_id=highlight_id if now < highlight_until else None,
                    muted=not self.sound_on,
                    enrolled=enrolled,
                    picker_open=self._picker_open,
                    cameras=self._cameras,
                    current_camera=self.camera.index,
                    camera_status=self._camera_status if now < self._status_until else "",
                )
                vis, layout = render(frame, labeled, self.settings, hud)
                self._people = sum(1 for item in labeled if item.label == "persona")
                self._identities = sum(1 for item in labeled if item.identity)
                if self._stream is not None:
                    self._stream.publish(vis)
                if not self.settings.headless:
                    self._handle_click(vis, layout)

                for track in new_targets:
                    self.unique_ids.add(track.id)
                    self.events += 1
                    notify_new_target(track.id, self.sound_on, track.identity)
                    path = self.store.save(
                        vis,
                        labeled,
                        event_type="nuevo_objetivo",
                        track_id=track.id,
                        extra={
                            "unique_people": len(self.unique_ids),
                            "session_events": self.events,
                        },
                    )
                    if self.settings.enable_clips:
                        video = self.clips.start(path.with_suffix(".mp4"), frame, now)
                        if video is not None:
                            self.store.attach_video(path, video)
                    last_name = path.name
                    flash_until = now + 0.18

                for track in identified:
                    self.events += 1
                    notify_new_target(track.id, self.sound_on, track.identity)
                    path = self.store.save(
                        vis,
                        labeled,
                        event_type="identidad",
                        track_id=track.id,
                        extra={
                            "unique_people": len(self.unique_ids),
                            "session_events": self.events,
                        },
                    )
                    last_name = path.name
                    flash_until = now + 0.18
                    highlight_id = track.id
                    highlight_until = now + 2.4

                if not self.settings.headless:
                    cv2.imshow(WINDOW_NAME, vis)

                self._last_vis = vis
                self._last_labeled = labeled
                self._drain_commands()

                fps_frames += 1
                elapsed = time.perf_counter() - fps_t0
                if elapsed >= 0.5:
                    fps = fps_frames / elapsed
                    self._fps = fps
                    fps_frames = 0
                    fps_t0 = time.perf_counter()

                if self.settings.headless:
                    time.sleep(0.001)
                    continue

                key = cv2.waitKey(1) & 0xFF
                if key in (ord("q"), ord("Q"), 27):
                    break
                if key in (ord("s"), ord("S")):
                    path = self.store.save(vis, labeled, event_type="manual")
                    last_name = path.name
                    flash_until = time.time() + 0.18
                if key == 32:
                    self._paused = not self._paused
                    log.info("Pausa" if self._paused else "Reanudado")
                if key in (ord("g"), ord("G")):
                    page = rebuild_gallery()
                    webbrowser.open(page.resolve().as_uri())
                if key in (ord("m"), ord("M")):
                    self.sound_on = not self.sound_on
                    log.info("Audio %s", "ON" if self.sound_on else "OFF")
                if key in (ord("r"), ord("R")):
                    count = self.detector.reload_identities()
                    names = self.detector.identity.names() if self.detector.identity else []
                    log.info("Galería recargada: %s identidades %s", count, names)
                if key in (ord("c"), ord("C")):
                    self._toggle_picker()
                if self._picker_open and ord("0") <= key <= ord("9"):
                    self._select_camera(key - ord("0"))
        finally:
            self._phase = "stopped"
            self.clips.close()
            if self.async_detector is not None:
                self.async_detector.stop()
            if self.camera is not None:
                self.camera.release()
            if self._stream is not None:
                self._stream.stop()
            if not self.settings.headless:
                cv2.destroyAllWindows()
            log.info(
                "Sesión %s finalizada · %s objetivos únicos · %s eventos",
                self.session_id,
                len(self.unique_ids),
                self.events,
            )


    def submit_command(self, cmd: str, timeout: float = 30.0, **kwargs) -> tuple[bool, str, dict]:
        box: dict = {}
        event = threading.Event()
        self._commands.put({"cmd": cmd, "event": event, "box": box, **kwargs})
        if not event.wait(timeout):
            return False, "El motor no respondió al comando", box
        return bool(box.get("ok")), str(box.get("message") or ""), box

    def _drain_commands(self) -> None:
        while True:
            try:
                item = self._commands.get_nowait()
            except queue.Empty:
                return
            self._run_command(item)

    def _run_command(self, item: dict) -> None:
        box = item.setdefault("box", {})
        event = item.get("event")
        cmd = str(item.get("cmd") or "")
        try:
            if cmd in {"camera", "select_camera"}:
                ok = self._select_camera(int(item.get("index", -1)))
                box["ok"] = ok
                box["message"] = self._camera_status or ("Cámara lista" if ok else "No se pudo cambiar de cámara")
            elif cmd == "pause":
                self._paused = not self._paused
                box["ok"] = True
                box["message"] = "Detección en pausa" if self._paused else "Detección en vivo"
                self._set_status(box["message"])
            elif cmd == "capture":
                if self._last_vis is None:
                    box["ok"] = False
                    box["message"] = "Todavía no hay un frame para capturar"
                else:
                    path = self.store.save(self._last_vis, self._last_labeled or [], event_type="manual")
                    self._last_capture_name = path.name
                    box["ok"] = True
                    box["message"] = f"Captura {path.name}"
                    self._set_status(box["message"])
            elif cmd == "mute":
                self.sound_on = not self.sound_on
                box["ok"] = True
                box["message"] = "Audio OFF" if not self.sound_on else "Audio ON"
                self._set_status(box["message"])
            elif cmd in {"reload_faces", "faces"}:
                count = self.detector.reload_identities() if self.detector is not None else 0
                names = self.detector.identity.names() if self.detector and self.detector.identity else []
                box["ok"] = True
                box["message"] = f"Identidades recargadas: {count}"
                box["names"] = names
                self._set_status(box["message"])
            elif cmd == "gallery":
                page = rebuild_gallery()
                uri = page.resolve().as_uri()
                box["ok"] = True
                box["message"] = "Galería lista"
                box["url"] = uri
                try:
                    webbrowser.open(uri)
                except Exception:
                    pass
            elif cmd == "refresh_cameras":
                box["ok"] = True
                box["message"] = f"{len(self.stream_cameras())} cámaras"
            else:
                box["ok"] = False
                box["message"] = f"Comando desconocido: {cmd}"
            box["cameras"] = self.stream_cameras()
            box["paused"] = self._paused
            box["muted"] = not self.sound_on
        except Exception as exc:
            log.warning("Comando %s falló (%s)", cmd, exc)
            box["ok"] = False
            box["message"] = str(exc)
        finally:
            if event is not None:
                event.set()

    def _on_mouse(self, event: int, x: int, y: int, _flags: int, _userdata) -> None:
        if event == cv2.EVENT_LBUTTONUP:
            self._click = (x, y)

    def _handle_click(self, vis: np.ndarray, layout: HudLayout) -> None:
        click = self._click
        self._click = None
        if click is None:
            return
        h, w = vis.shape[:2]
        mapped = _map_click(click[0], click[1], w, h)
        hit = next((item for item in layout.hits if item.contains(click[0], click[1])), None)
        if hit is None:
            hit = next((item for item in layout.hits if item.contains(mapped[0], mapped[1])), None)
        if hit is None:
            if self._picker_open:
                self._picker_open = False
            return
        if hit.action == "toggle":
            self._toggle_picker()
            return
        if hit.action == "select":
            self._select_camera(hit.index)

    def _toggle_picker(self) -> None:
        self._picker_open = not self._picker_open
        if not self._picker_open or self.camera is None:
            return
        try:
            self._cameras = picker_devices(self.camera.device)
        except Exception as exc:
            log.warning("No se pudo listar camaras (%s)", exc)
            self._cameras = [self.camera.device]
        log.info("Camaras: %s", ", ".join(f"#{item.index} {item.name or item.backend}" for item in self._cameras))

    def _select_camera(self, index: int) -> bool:
        assert self.camera is not None
        self._picker_open = False
        if index == self.camera.index:
            self._set_status(f"Camara #{index} ya activa")
            return True
        name = next((item.name for item in self._cameras if item.index == index), "")
        self._set_status(f"Cambiando a camara #{index}...")
        try:
            device = self.camera.switch_to(index, name=name)
            try:
                self._cameras = picker_devices(device)
            except Exception:
                self._cameras = [device]
            self._set_status(f"Camara #{device.index} lista")
            return True
        except Exception as exc:
            log.warning("No se pudo cambiar a la camara %s (%s)", index, exc)
            self._set_status(f"No se pudo abrir camara #{index}: {exc}")
            return False

    def _set_status(self, text: str) -> None:
        self._camera_status = text
        self._status_until = time.time() + 3.0
        log.info(text)

    def _announce(self, title: str, subtitle: str) -> None:
        if not self.settings.headless:
            _show_status(title, subtitle)
        if self._stream is not None:
            self._stream.publish_status(title, subtitle)

    def request_stop(self) -> None:
        self._stop.set()

    def stop_requested(self) -> bool:
        return self._stop.is_set()

    def stream_ready(self) -> bool:
        return self._phase == "ready" and self.camera is not None

    def stream_cameras(self, refresh: bool = False) -> list[dict]:
        if self.camera is None:
            return []
        devices = list(self._cameras or [self.camera.device])
        seen = {item.index for item in devices}
        names: list[str] = []
        try:
            names = windows_device_names()
        except Exception:
            names = []
        for i, item in enumerate(list(devices)):
            if item.name or item.index >= len(names):
                continue
            named = names[item.index]
            if named:
                devices[i] = VideoDevice(item.index, item.backend, item.width, item.height, named)
        leftover = [
            name
            for idx, name in enumerate(names)
            if idx not in seen and name and device_kind(name) != "ir"
        ]
        next_idx = 0
        for name in leftover:
            while next_idx in seen:
                next_idx += 1
            devices.append(VideoDevice(next_idx, "Windows", 0, 0, name))
            seen.add(next_idx)
            next_idx += 1
        for idx in range(4):
            if idx in seen:
                continue
            name = names[idx] if idx < len(names) else f"Camara {idx}"
            if device_kind(name) == "ir":
                continue
            devices.append(VideoDevice(idx, "Index", 0, 0, name))
            seen.add(idx)
        payload = []
        for item in devices:
            name = item.name or f"Camara {item.index}"
            payload.append(
                {
                    "index": item.index,
                    "name": name,
                    "backend": item.backend,
                    "width": item.width,
                    "height": item.height,
                    "active": item.index == self.camera.index,
                    "kind": device_kind(name),
                }
            )
        return payload

    def stream_status(self) -> dict:
        camera = None
        if self.camera is not None:
            camera = {
                "index": self.camera.index,
                "name": self.camera.device.name or f"Camara {self.camera.index}",
                "kind": device_kind(self.camera.device.name),
            }
        return {
            "ok": True,
            "ready": self.stream_ready(),
            "phase": self._phase,
            "fps": round(self._fps, 1),
            "people": self._people,
            "identities": self._identities,
            "events": self.events,
            "camera": camera,
            "cameras": self.stream_cameras(),
            "paused": self._paused,
            "muted": not self.sound_on,
            "message": self._camera_status if time.time() < self._status_until else "",
        }

    def stream_select_camera(self, index: int) -> tuple[bool, str]:
        if self.camera is None or self._phase != "ready":
            return False, "La camara todavia no esta lista"
        ok, message, _box = self.submit_command("camera", timeout=40, index=index)
        return ok, message

    def stream_command(self, cmd: str, extra: dict | None = None) -> dict:
        extra = extra or {}
        if cmd in {"camera", "select_camera"}:
            ok, message, box = self.submit_command("camera", timeout=40, index=extra.get("index", -1))
        else:
            ok, message, box = self.submit_command(cmd, timeout=20, **extra)
        return {
            "ok": ok,
            "message": message,
            "cameras": box.get("cameras") or self.stream_cameras(),
            "paused": box.get("paused", self._paused),
            "muted": box.get("muted", not self.sound_on),
            "url": box.get("url"),
        }


def _map_click(x: int, y: int, frame_w: int, frame_h: int) -> tuple[int, int]:
    try:
        _wx, _wy, ww, wh = cv2.getWindowImageRect(WINDOW_NAME)
    except Exception:
        return x, y
    if ww <= 0 or wh <= 0:
        return x, y
    return int(x * frame_w / ww), int(y * frame_h / wh)


def _show_status(title: str, subtitle: str) -> None:
    canvas = np.zeros((720, 1280, 3), dtype=np.uint8)
    cv2.putText(canvas, "RECONOCIMIENTO", (80, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.4, CYAN, 3, cv2.LINE_AA)
    cv2.putText(canvas, title, (80, 370), cv2.FONT_HERSHEY_SIMPLEX, 0.9, WHITE, 2, cv2.LINE_AA)
    cv2.putText(canvas, subtitle, (80, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.6, DIM, 1, cv2.LINE_AA)
    cv2.imshow(WINDOW_NAME, canvas)
