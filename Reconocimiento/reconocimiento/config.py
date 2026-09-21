from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"
CAPTURE_DIR = ROOT / "captures"
LOG_DIR = ROOT / "logs"
FACES_DIR = ROOT / "faces"


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip()


@dataclass
class Settings:
    location_name: str = os.getenv("LOCATION_NAME", "Laptop / Webcam local")
    latitude: float = _env_float("DRONE_LAT", 0.0)
    longitude: float = _env_float("DRONE_LON", 0.0)
    altitude_m: float = _env_float("DRONE_ALT", 0.0)
    camera_index: int = _env_int("CAMERA_INDEX", 0)
    camera_device: str = _env_str("CAMERA_DEVICE", "")
    camera_lock: bool = False
    camera_lock_forced: bool = False
    source_kind: str = _env_str("VIDEO_KIND", "laptop")
    video_fourcc: str = _env_str("VIDEO_FOURCC", "auto")
    confidence: float = _env_float("CONF_THRESHOLD", 0.45)
    nms_threshold: float = 0.4
    capture_cooldown_s: float = _env_float("CAPTURE_COOLDOWN", 8.0)
    detect_fps: float = 12.0
    camera_width: int = 1280
    camera_height: int = 720
    window_title: str = "RECONOCIMIENTO — Deteccion en vivo"
    enable_faces: bool = True
    source_name: str = _env_str("VIDEO_SOURCE", "webcam_laptop")
    enable_clips: bool = True
    enable_sound: bool = True
    clip_pre_s: float = 2.0
    clip_post_s: float = 2.0
    clip_fps: float = 12.0
    track_min_hits: int = 3
    track_max_missing_s: float = 1.8
    track_iou: float = 0.3
    enable_identity: bool = True
    identity_threshold: float = _env_float("IDENTITY_THRESHOLD", 0.35)
    headless: bool = False
    stream_port: int = _env_int("STREAM_PORT", 0)


YOLO_CFG = MODELS_DIR / "yolov4-tiny.cfg"
YOLO_WEIGHTS = MODELS_DIR / "yolov4-tiny.weights"
YUNET_ONNX = MODELS_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_ONNX = MODELS_DIR / "face_recognition_sface_2021dec.onnx"

YOLO_WEIGHTS_URL = (
    "https://github.com/AlexeyAB/darknet/releases/download/"
    "darknet_yolo_v4_pre/yolov4-tiny.weights"
)
YUNET_URL = (
    "https://github.com/opencv/opencv_zoo/raw/main/models/"
    "face_detection_yunet/face_detection_yunet_2023mar.onnx"
)
SFACE_URLS = (
    "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
    "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
)

PERSON_CLASS_ID = 0
