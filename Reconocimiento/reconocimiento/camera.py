from __future__ import annotations

import logging
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, replace
from typing import Optional

import cv2
import numpy as np

from .config import Settings

log = logging.getLogger("reconocimiento")

CAPTURE_NAME_HINTS = (
    "usb video",
    "usb2.0",
    "capture",
    "hdmi",
    "cam link",
    "elgato",
    "avermedia",
    "live gamer",
    "ezcap",
    "grabber",
    "magewell",
    "game capture",
    "video kit",
)
ANALOG_NAME_HINTS = (
    "skydroid",
    "sky droid",
    "otg",
    "analog",
    "5.8",
    "receiver",
    "uvc",
    "usb camera",
    "usb2.0 camera",
    "usb2.0 pc",
    "pc camera",
    "usb video",
)
SKIP_NAME_HINTS = (
    "ir camera",
    "infrared",
    "winir",
    "hello",
)


@dataclass(frozen=True)
class VideoDevice:
    index: int
    backend: str
    width: int
    height: int
    name: str = ""


def _backends() -> list[int]:
    if sys.platform.startswith("win"):
        return [cv2.CAP_DSHOW, cv2.CAP_MSMF, cv2.CAP_ANY]
    backends = [cv2.CAP_ANY]
    if hasattr(cv2, "CAP_V4L2"):
        backends.insert(0, cv2.CAP_V4L2)
    return backends


def _backend_name(code: int) -> str:
    names = {
        getattr(cv2, "CAP_DSHOW", -1): "DirectShow",
        getattr(cv2, "CAP_MSMF", -2): "Media Foundation",
        getattr(cv2, "CAP_V4L2", -3): "V4L2",
        cv2.CAP_ANY: "Auto",
    }
    return names.get(code, str(code))


def windows_device_names() -> list[str]:
    return _windows_device_names()


def _windows_device_names() -> list[str]:
    if not sys.platform.startswith("win"):
        return []
    script = (
        "Get-CimInstance Win32_PnPEntity | "
        "Where-Object { "
        "$_.PNPClass -eq 'Camera' -or "
        "$_.Name -match 'USB Video|USB Camera|HDMI Capture|Cam Link|Capture Card|Elgato|AVerMedia|Game Capture|SkyDroid|OTG' "
        "} | Select-Object -ExpandProperty Name"
    )
    try:
        raw = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", script],
            timeout=8,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return []
    names: list[str] = []
    for line in raw.decode("utf-8", errors="ignore").splitlines():
        name = line.strip()
        if name and name not in names:
            names.append(name)
    return names


def _looks_like_capture(name: str) -> bool:
    low = name.lower()
    return any(hint in low for hint in CAPTURE_NAME_HINTS)


def _looks_like_analog(name: str) -> bool:
    low = name.lower()
    return any(hint in low for hint in ANALOG_NAME_HINTS)


def _looks_like_ir(name: str) -> bool:
    low = name.lower()
    return any(hint in low for hint in SKIP_NAME_HINTS)


def device_kind(name: str) -> str:
    low = (name or "").lower()
    if _looks_like_ir(low):
        return "ir"
    if _looks_like_analog(low) and "hdmi" not in low:
        return "skydroid"
    if _looks_like_capture(low):
        return "hdmi"
    return "laptop"


def source_kind_for_name(name: str) -> str:
    kind = device_kind(name)
    if kind == "skydroid":
        return "analog"
    if kind == "hdmi":
        return "goggles"
    return "laptop"


def _fourcc_attempts(settings: Settings) -> list[Optional[str]]:
    mode = (settings.video_fourcc or "auto").strip().lower()
    if mode in {"none", "raw"}:
        return [None]
    if mode == "mjpg":
        return ["MJPG"]
    if mode == "yuy2":
        return ["YUY2"]
    if settings.source_kind in {"goggles", "analog"}:
        return [None, "YUY2", "MJPG"]
    return ["MJPG", None, "YUY2"]


def _fps_attempts(settings: Settings) -> list[float]:
    if settings.source_kind == "goggles":
        return [60.0, 30.0]
    if settings.source_kind == "analog":
        return [30.0, 25.0]
    return [30.0]


def _size_attempts(settings: Settings) -> list[tuple[int, int]]:
    primary = (settings.camera_width, settings.camera_height)
    extras = [(1280, 720), (640, 480), (720, 480), (960, 540), (1920, 1080)]
    sizes: list[tuple[int, int]] = []
    for item in (primary, *extras):
        if item not in sizes:
            sizes.append(item)
    if settings.source_kind == "analog":
        analog = [(640, 480), (720, 480), (1280, 720)]
        return analog + [item for item in sizes if item not in analog]
    return sizes


def _apply_format(
    cap: cv2.VideoCapture,
    settings: Settings,
    fourcc: Optional[str],
    fps: float,
    width: Optional[int] = None,
    height: Optional[int] = None,
) -> None:
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width or settings.camera_width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height or settings.camera_height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FPS, fps)
    if fourcc:
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*fourcc))


def _open_target(target: int | str, backend: int) -> cv2.VideoCapture:
    if isinstance(target, str):
        label = target if target.lower().startswith("video=") else f"video={target}"
        return cv2.VideoCapture(label, backend)
    return cv2.VideoCapture(target, backend)


def _try_open(
    target: int | str,
    settings: Settings,
    *,
    timeout_s: float,
    quick: bool = False,
) -> tuple[Optional[cv2.VideoCapture], str]:
    last_error = "sin señal"
    backends = _backends()
    if quick and sys.platform.startswith("win"):
        backends = [cv2.CAP_DSHOW, cv2.CAP_MSMF]
    sizes = _size_attempts(settings)
    if quick:
        sizes = sizes[:3]
    elif settings.source_kind == "laptop":
        sizes = sizes[:1]
    else:
        sizes = sizes[:2]
    for backend in backends:
        for fourcc in _fourcc_attempts(settings):
            for fps in _fps_attempts(settings):
                for width, height in sizes:
                    cap = _open_target(target, backend)
                    if not cap.isOpened():
                        cap.release()
                        last_error = f"{target} / {_backend_name(backend)} no abrió"
                        continue
                    _apply_format(cap, settings, fourcc, fps, width, height)
                    ok, frame, hung = _read_with_timeout(cap, seconds=timeout_s)
                    if hung:
                        last_error = f"{target} / {_backend_name(backend)} se colgó al leer"
                        log.warning(last_error)
                        cap.release()
                        continue
                    if ok and frame is not None and frame.size > 0:
                        codec = fourcc or "auto"
                        log.info(
                            "Fuente %s abierta (%s · %s · %.0f fps) · %sx%s",
                            target,
                            _backend_name(backend),
                            codec,
                            fps,
                            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or frame.shape[1],
                            int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or frame.shape[0],
                        )
                        return cap, ""
                    last_error = f"{target} / {_backend_name(backend)} no entregó frames"
                    cap.release()
    return None, last_error


def _probe_backends() -> list[int]:
    if sys.platform.startswith("win"):
        return [cv2.CAP_DSHOW, cv2.CAP_MSMF]
    return _backends()


def probe_index(index: int) -> Optional[VideoDevice]:
    for backend in _probe_backends():
        cap = cv2.VideoCapture(index, backend)
        if not cap.isOpened():
            cap.release()
            continue
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0
        cap.release()
        return VideoDevice(index, _backend_name(backend), width, height)
    return None


def device_label(device: VideoDevice) -> str:
    name = device.name.strip() if device.name else f"Camara {device.index}"
    if device.width and device.height:
        return f"#{device.index}  {name}  {device.width}x{device.height}"
    return f"#{device.index}  {name}"


def list_cameras(max_index: int = 8, skip_index: Optional[int] = None) -> list[VideoDevice]:
    names = _windows_device_names()
    found: list[VideoDevice] = []
    misses = 0
    for index in range(max_index):
        if skip_index is not None and index == skip_index:
            misses = 0
            continue
        device = probe_index(index)
        if device is None:
            misses += 1
            if misses >= 4 and index >= 3:
                break
            continue
        misses = 0
        name = names[index] if index < len(names) else ""
        found.append(VideoDevice(device.index, device.backend, device.width, device.height, name))
    return found


def picker_devices(current: VideoDevice) -> list[VideoDevice]:
    others = list_cameras(skip_index=current.index)
    merged = [current]
    seen = {current.index}
    for item in others:
        if item.index in seen:
            continue
        merged.append(item)
        seen.add(item.index)
    merged.sort(key=lambda item: item.index)
    return merged


def current_device(index: int, cap: cv2.VideoCapture) -> VideoDevice:
    names = _windows_device_names()
    name = names[index] if index < len(names) else ""
    return VideoDevice(
        index,
        "DirectShow",
        int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 0,
        int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 0,
        name or f"Camara {index}",
    )


def print_camera_list() -> int:
    print()
    print("  Fuentes de video detectadas")
    print("  ---------------------------")
    devices = list_cameras()
    extra = _windows_device_names()
    if not devices and not extra:
        print("  No se encontró ninguna cámara ni tarjeta de captura.")
        print("  Conecta la captura HDMI y vuelve a intentar.")
        print()
        return 1
    if devices:
        print(f"  {'Indice':<8}{'Backend':<20}{'Tamano':<14}Nombre")
        for item in devices:
            size = f"{item.width}x{item.height}" if item.width and item.height else "?"
            print(f"  {item.index:<8}{item.backend:<20}{size:<14}{item.name or '-'}")
    if extra:
        print()
        print("  Dispositivos Windows (cámara / captura):")
        for name in extra:
            mark = ""
            if _looks_like_analog(name) and "hdmi" not in name.lower():
                mark = "  <- probable SkyDroid / analogico OTG"
            elif _looks_like_capture(name):
                mark = "  <- probable HDMI / goggles"
            elif _looks_like_ir(name):
                mark = "  (ignorar, IR)"
            print(f"    • {name}{mark}")
    print()
    print("  Webcam laptop:     python main.py")
    print("  SkyDroid analog:   python main.py --source analog")
    print("  Fat Shark / HDMI:  python main.py --source goggles")
    print("  Indice fijo:       python main.py --source analog --camera 1")
    print()
    return 0


def _auto_external_index(*, analog: bool) -> Optional[int]:
    names = _windows_device_names()
    devices = list_cameras()
    match = _looks_like_analog if analog else _looks_like_capture
    for item in devices:
        label = item.name or (names[item.index] if item.index < len(names) else "")
        if label and match(label) and not _looks_like_ir(label):
            return item.index
    for idx, name in enumerate(names):
        if match(name) and not _looks_like_ir(name):
            return idx
    extras = [item.index for item in devices if item.index != 0]
    if len(extras) == 1:
        return extras[0]
    return None


def open_capture(settings: Settings, *, quick: bool = False) -> cv2.VideoCapture:
    """Abre webcam, SkyDroid OTG o tarjeta HDMI (Fat Shark / Avatar)."""
    timeout_s = 2.2 if quick else (5.0 if settings.source_kind in {"goggles", "analog"} else 3.0)
    last_error = "sin cámara"
    targets: list[int | str] = []

    if settings.camera_device:
        targets.append(settings.camera_device)
    elif settings.source_kind in {"goggles", "analog"} and not settings.camera_lock_forced:
        auto = _auto_external_index(analog=settings.source_kind == "analog")
        if auto is None:
            if settings.source_kind == "analog":
                raise RuntimeError(
                    "No se detecto el receptor analogico (SkyDroid OTG).\n"
                    "  • Enchufa el SkyDroid 5.8G por USB a la laptop.\n"
                    "  • Cierra la app Camara, OBS o el visor que lo este usando.\n"
                    "  • Lista dispositivos: python main.py --list-cameras\n"
                    "  • Fuerza el indice:   python main.py --source analog --camera 1"
                )
            raise RuntimeError(
                "No se detectó una tarjeta de captura HDMI.\n"
                "  • Los Recon HD no aparecen como webcam: el PC no habla Avatar HD.\n"
                "  • Conecta: goggles USB-C -> USB-C a HDMI -> captura HDMI-USB -> laptop.\n"
                "  • Enciende la captura ANTES de los goggles (frame rate 60 Hz).\n"
                "  • Lista dispositivos: python main.py --list-cameras\n"
                "  • Si Windows ya la ve: python main.py --source goggles --camera 1"
            )
        log.info("Fuente externa detectada en índice %s (%s)", auto, settings.source_kind)
        targets.append(auto)
    else:
        targets.append(settings.camera_index)

    if not settings.camera_lock:
        for index in range(4):
            if index not in targets:
                targets.append(index)

    seen: set[int | str] = set()
    ordered: list[int | str] = []
    for target in targets:
        if target in seen:
            continue
        seen.add(target)
        ordered.append(target)

    for target in ordered:
        cap, error = _try_open(target, settings, timeout_s=timeout_s, quick=quick)
        if cap is not None:
            if isinstance(target, int):
                settings.camera_index = target
            return cap
        last_error = error or last_error
        if settings.camera_lock:
            break

    if settings.source_kind == "analog":
        raise RuntimeError(
            "No se pudo abrir el receptor analogico.\n"
            "  • El SkyDroid 5.8G OTG debe verse en Windows como una camara USB.\n"
            "  • Enchufalo por USB, espera el driver, y cierra otras apps que lo usen.\n"
            "  • Lista:  python main.py --list-cameras\n"
            "  • Fuerza: python main.py --source analog --camera 1\n"
            f"  • Detalle: {last_error}"
        )

    if settings.source_kind == "goggles":
        raise RuntimeError(
            "No se pudo abrir el video de los goggles.\n"
            "  • Los Recon HD NO se conectan por USB de datos: el PC no habla Avatar HD.\n"
            "  • Cadena: goggles USB-C -> cable USB-C a HDMI -> tarjeta captura HDMI-USB -> PC.\n"
            "  • Enciende la tarjeta y conéctala ANTES de encender los goggles.\n"
            "  • En los goggles: frame rate Standard (60 Hz), no High (100 Hz).\n"
            "  • Lista dispositivos: python main.py --list-cameras\n"
            "  • Fuerza el índice:   python main.py --source goggles --camera 1\n"
            f"  • Detalle: {last_error}"
        )

    raise RuntimeError(
        "No se pudo abrir la webcam.\n"
        "  • Cierra Zoom, Teams, Skype u otra app que esté usando la cámara.\n"
        "  • En Windows: Configuración → Privacidad → Cámara → permite el acceso.\n"
        "  • Prueba otra cámara: python main.py --camera 1\n"
        "  • Lista dispositivos: python main.py --list-cameras\n"
        f"  • Detalle: {last_error}"
    )


def _read_with_timeout(
    cap: cv2.VideoCapture, seconds: float
) -> tuple[bool, Optional[np.ndarray], bool]:
    result: dict[str, object] = {"ok": False, "frame": None}

    def _read() -> None:
        ok, frame = cap.read()
        result["ok"] = bool(ok)
        result["frame"] = frame

    worker = threading.Thread(target=_read, daemon=True)
    worker.start()
    worker.join(seconds)
    if worker.is_alive():
        return False, None, True
    return bool(result["ok"]), result["frame"], False  # type: ignore[return-value]


class CameraStream:
    """Lee la cámara o captura HDMI en un hilo para que la ventana no se congele."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.cap = open_capture(settings)
        self.index = settings.camera_index
        self.device = current_device(self.index, self.cap)
        self._lock = threading.Lock()
        self._swap_lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._ok = False
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="camera", daemon=True)
        self._thread.start()
        self._wait_frame(6.0)

    def _wait_frame(self, seconds: float) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            ok, frame = self.read()
            if ok and frame is not None:
                return
            time.sleep(0.05)
        raise RuntimeError("La fuente de video se abrió pero no entrega imagen.")

    def _loop(self) -> None:
        while self._running:
            try:
                with self._swap_lock:
                    cap = self.cap
                ok, frame = cap.read()
            except Exception:
                ok, frame = False, None
            with self._lock:
                self._ok = bool(ok)
                self._frame = frame
            if not ok:
                time.sleep(0.03)

    def switch_to(self, index: int, name: str = "") -> VideoDevice:
        if index == self.index:
            return self.device
        prev_index = self.index
        prev_kind = self.settings.source_kind
        source_kind = source_kind_for_name(name) if name else self.settings.source_kind
        analog = source_kind == "analog"
        next_settings = replace(
            self.settings,
            camera_index=index,
            camera_device="",
            camera_lock=True,
            camera_lock_forced=True,
            source_kind=source_kind,
            camera_width=640 if analog else self.settings.camera_width,
            camera_height=480 if analog else self.settings.camera_height,
        )
        with self._swap_lock:
            old = self.cap
            try:
                old.release()
            except Exception:
                pass
            time.sleep(0.45)
            try:
                new_cap = open_capture(next_settings, quick=True)
            except Exception:
                restore = replace(
                    self.settings,
                    camera_index=prev_index,
                    camera_device="",
                    camera_lock=True,
                    camera_lock_forced=True,
                    source_kind=prev_kind,
                )
                try:
                    self.cap = open_capture(restore, quick=True)
                    self.index = prev_index
                    self.settings.camera_index = prev_index
                    self.settings.source_kind = prev_kind
                    self.device = current_device(prev_index, self.cap)
                except Exception:
                    log.exception("No se pudo reabrir la camara %s despues del fallo", prev_index)
                raise
            self.cap = new_cap
            self.index = index
            self.settings.camera_index = index
            self.settings.source_kind = source_kind
            self.device = current_device(index, new_cap)
        with self._lock:
            self._frame = None
            self._ok = False
        self._wait_frame(6.0)
        log.info("Camara activa: %s", device_label(self.device))
        return self.device

    def read(self) -> tuple[bool, Optional[np.ndarray]]:
        with self._lock:
            if self._frame is None:
                return False, None
            return self._ok, self._frame.copy()

    def release(self) -> None:
        self._running = False
        self._thread.join(timeout=1.5)
        self.cap.release()
