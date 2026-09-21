from __future__ import annotations

import logging
import re
import threading
from pathlib import Path

import cv2
import numpy as np

from .config import FACES_DIR, SFACE_ONNX, SFACE_URLS, YUNET_ONNX, YUNET_URL, Settings
from .detections import Detection
from .download import ensure_file, ensure_file_from_urls

log = logging.getLogger("reconocimiento")

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
_COMMA_EXT = re.compile(r"^(.+),(jpg|jpeg|png|webp|bmp)$", re.IGNORECASE)


class IdentityEngine:
    """Compara rostros en vivo contra las fotos de faces/Nombre.jpg."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.face_detector: cv2.FaceDetectorYN | None = None
        self.recognizer: cv2.FaceRecognizerSF | None = None
        self.gallery: dict[str, list[np.ndarray]] = {}
        self._lock = threading.Lock()
        self._signature = ""

        try:
            ensure_file(YUNET_ONNX, YUNET_URL)
            self.face_detector = cv2.FaceDetectorYN.create(
                model=str(YUNET_ONNX),
                config="",
                input_size=(320, 320),
                score_threshold=0.55,
                nms_threshold=0.3,
                top_k=20,
            )
        except Exception as exc:
            log.warning("YuNet de enrolamiento no disponible (%s)", exc)

        try:
            ensure_file_from_urls(SFACE_ONNX, SFACE_URLS)
            if SFACE_ONNX.stat().st_size < 1_000_000:
                raise RuntimeError("El modelo SFace descargado está incompleto")
            self.recognizer = cv2.FaceRecognizerSF.create(str(SFACE_ONNX), "")
            dummy = np.zeros((112, 112, 3), dtype=np.uint8)
            self.recognizer.feature(dummy)
            log.info("Reconocimiento de identidad: SFace")
        except Exception as exc:
            log.warning("SFace no disponible (%s). Sin identificación por nombre.", exc)
            return

        n = self.reload()
        if n == 0:
            log.warning("No hay identidades en %s. Pon fotos como Andrick.jpg", FACES_DIR)

    @property
    def ready(self) -> bool:
        return self.recognizer is not None and bool(self.gallery)

    def names(self) -> list[str]:
        with self._lock:
            return sorted(self.gallery.keys())

    def reload(self) -> int:
        if self.recognizer is None:
            return 0
        files = _list_gallery_files(FACES_DIR)
        signature = "|".join(f"{p}:{p.stat().st_mtime_ns}:{p.stat().st_size}" for p in files)
        with self._lock:
            if signature == self._signature and self.gallery:
                return len(self.gallery)
            gallery: dict[str, list[np.ndarray]] = {}
            for path in files:
                name = _person_name(path, FACES_DIR)
                if not name:
                    continue
                image = _imread(path)
                if image is None:
                    log.warning("No se pudo leer %s", path.name)
                    continue
                embedding = self._embed_image(image)
                if embedding is None:
                    log.warning("No se detectó un rostro en %s", path.name)
                    continue
                gallery.setdefault(name, []).append(embedding)
                log.info("Identidad cargada: %s ← %s", name, path.name)
            self.gallery = gallery
            self._signature = signature
        return len(self.gallery)

    def identify(self, frame: np.ndarray, det: Detection) -> tuple[str | None, float]:
        if self.recognizer is None or not self.gallery:
            return None, 0.0
        with self._lock:
            feature = self._embed_detection(frame, det)
            if feature is None:
                return None, 0.0
            best_name = None
            best_score = -1.0
            for name, embeddings in self.gallery.items():
                for stored in embeddings:
                    score = float(
                        self.recognizer.match(feature, stored, cv2.FaceRecognizerSF_FR_COSINE)
                    )
                    if score > best_score:
                        best_score = score
                        best_name = name
            if best_name is None or best_score < self.settings.identity_threshold:
                return None, best_score if best_score >= 0 else 0.0
            return best_name, best_score

    def _embed_detection(self, frame: np.ndarray, det: Detection) -> np.ndarray | None:
        assert self.recognizer is not None
        if det.landmarks and len(det.landmarks) >= 15:
            row = np.asarray(det.landmarks, dtype=np.float32)
            try:
                aligned = self.recognizer.alignCrop(frame, row)
                return self.recognizer.feature(aligned)
            except Exception:
                pass
        return self._embed_crop(frame, det.box)

    def _embed_image(self, image: np.ndarray) -> np.ndarray | None:
        assert self.recognizer is not None
        if self.face_detector is not None:
            h, w = image.shape[:2]
            self.face_detector.setInputSize((w, h))
            _retval, faces = self.face_detector.detect(image)
            if faces is not None and len(faces) > 0:
                if len(faces) > 1:
                    log.info("Varios rostros en la foto de galería; se usa el más grande")
                face = max(faces, key=lambda row: float(row[2] * row[3]))
                try:
                    aligned = self.recognizer.alignCrop(image, face)
                    return self.recognizer.feature(aligned)
                except Exception:
                    pass
        h, w = image.shape[:2]
        side = min(h, w)
        x = (w - side) // 2
        y = (h - side) // 2
        crop = image[y : y + side, x : x + side]
        if crop.size == 0:
            return None
        aligned = cv2.resize(crop, (112, 112))
        return self.recognizer.feature(aligned)

    def _embed_crop(self, frame: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray | None:
        assert self.recognizer is not None
        x, y, w, h = box
        crop = frame[y : y + h, x : x + w]
        if crop.size == 0:
            return None
        aligned = cv2.resize(crop, (112, 112))
        return self.recognizer.feature(aligned)


def _list_gallery_files(folder: Path) -> list[Path]:
    folder.mkdir(parents=True, exist_ok=True)
    found: list[Path] = []
    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        if path.suffix.lower() in IMAGE_EXTS:
            found.append(path)
        elif _COMMA_EXT.match(path.name):
            found.append(path)
    return found


def _person_name(path: Path, faces_dir: Path) -> str:
    try:
        rel = path.relative_to(faces_dir)
    except ValueError:
        rel = Path(path.name)
    if len(rel.parts) > 1:
        return rel.parts[0].replace("_", " ").strip()
    raw = path.stem
    comma = _COMMA_EXT.match(path.name)
    if comma:
        raw = comma.group(1)
    raw = re.sub(r"[_\-\s]+\d+$", "", raw)
    return raw.replace("_", " ").strip()


def _imread(path: Path) -> np.ndarray | None:
    data = np.fromfile(str(path), dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)
