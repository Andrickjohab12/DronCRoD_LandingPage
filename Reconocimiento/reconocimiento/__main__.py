from __future__ import annotations

import argparse
import logging
import sys

from reconocimiento import __version__
from reconocimiento.app import RecognitionApp
from reconocimiento.camera import print_camera_list
from reconocimiento.config import LOG_DIR, Settings


def _configure_stdio() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass


def _setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s", "%H:%M:%S")
    root = logging.getLogger("reconocimiento")
    root.setLevel(logging.INFO)
    root.handlers.clear()

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(fmt)
    root.addHandler(console)

    file_handler = logging.FileHandler(LOG_DIR / "app.log", encoding="utf-8")
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)


def _banner() -> None:
    print()
    print("  RECONOCIMIENTO  v" + __version__)
    print("  Deteccion de personas y rostros en tiempo real")
    print("  ----------------------------------------------")
    print()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reconocimiento de personas por webcam, SkyDroid analogico o HDMI de goggles.",
    )
    parser.add_argument("--camera", type=int, default=None, help="Indice de camara (0 = integrada)")
    parser.add_argument("--device", default=None, help='Nombre DirectShow, ej. "USB Video"')
    parser.add_argument(
        "--source",
        choices=("laptop", "goggles", "analog"),
        default=None,
        help="laptop = webcam; analog = SkyDroid 5.8G OTG; goggles = HDMI Fat Shark / Avatar",
    )
    parser.add_argument("--list-cameras", action="store_true", help="Lista webcams y tarjetas HDMI y sale")
    parser.add_argument(
        "--fourcc",
        choices=("auto", "mjpg", "yuy2", "none"),
        default=None,
        help="Formato de captura (HDMI suele ser auto/yuy2, webcam mjpg)",
    )
    parser.add_argument("--conf", type=float, default=None, help="Umbral de confianza YOLO (0-1)")
    parser.add_argument("--cooldown", type=float, default=None, help="Segundos entre capturas automaticas")
    parser.add_argument("--no-faces", action="store_true", help="Solo detectar cuerpo/persona, no rostros")
    parser.add_argument("--no-clips", action="store_true", help="No grabar video alrededor del evento")
    parser.add_argument("--mute", action="store_true", help="Sin alerta de sonido")
    parser.add_argument("--no-identity", action="store_true", help="No comparar contra faces/")
    parser.add_argument("--id-threshold", type=float, default=None, help="Umbral SFace (0-1, default 0.35)")
    parser.add_argument("--width", type=int, default=None, help="Ancho de captura")
    parser.add_argument("--height", type=int, default=None, help="Alto de captura")
    parser.add_argument("--headless", action="store_true", help="Sin ventana OpenCV; sirve el stream al dashboard")
    parser.add_argument("--stream-port", type=int, default=None, help="Puerto HTTP MJPEG para el dashboard (ej. 5000)")
    return parser.parse_args()


def _normalize_source(settings: Settings) -> None:
    kind = (settings.source_kind or "laptop").strip().lower()
    goggles = {"goggle", "goggles", "fatshark", "avatar", "hdmi"}
    analog = {"analog", "analogue", "skydroid", "otg", "fpv"}
    if kind in goggles:
        settings.source_kind = "goggles"
        if settings.source_name in {"", "webcam_laptop"}:
            settings.source_name = "fatshark_recon_hd"
        settings.camera_lock = True
    elif kind in analog:
        settings.source_kind = "analog"
        if settings.source_name in {"", "webcam_laptop"}:
            settings.source_name = "skydroid_58_otg"
        settings.camera_lock = True
    else:
        settings.source_kind = "laptop"


def build_settings(args: argparse.Namespace) -> Settings:
    settings = Settings()
    if args.source is not None:
        settings.source_kind = args.source
    _normalize_source(settings)
    if args.camera is not None:
        settings.camera_index = args.camera
        settings.camera_lock = True
        settings.camera_lock_forced = True
    if args.device:
        settings.camera_device = args.device
        settings.camera_lock = True
        settings.camera_lock_forced = True
    if args.fourcc is not None:
        settings.video_fourcc = args.fourcc
    if args.conf is not None:
        settings.confidence = args.conf
    if args.cooldown is not None:
        settings.capture_cooldown_s = args.cooldown
    if args.no_faces:
        settings.enable_faces = False
    if args.no_clips:
        settings.enable_clips = False
    if args.mute:
        settings.enable_sound = False
    if args.no_identity:
        settings.enable_identity = False
    if args.id_threshold is not None:
        settings.identity_threshold = args.id_threshold
    if args.width is not None:
        settings.camera_width = args.width
    elif settings.source_kind == "analog":
        settings.camera_width = 720
    if args.height is not None:
        settings.camera_height = args.height
    elif settings.source_kind == "analog":
        settings.camera_height = 480
    if args.headless:
        settings.headless = True
    if args.stream_port is not None:
        settings.stream_port = args.stream_port
    elif settings.headless and not settings.stream_port:
        settings.stream_port = 5000
    return settings


def main() -> int:
    _configure_stdio()
    args = parse_args()
    if args.list_cameras:
        return print_camera_list()
    _setup_logging()
    _banner()
    settings = build_settings(args)

    try:
        app = RecognitionApp(settings)
        app.run()
        return 0
    except KeyboardInterrupt:
        print("\nInterrumpido.")
        return 0
    except Exception as exc:
        logging.getLogger("reconocimiento").exception("Error fatal")
        print(f"\nError: {exc}")
        if sys.stdin.isatty():
            input("\nPresiona Enter para cerrar...")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
