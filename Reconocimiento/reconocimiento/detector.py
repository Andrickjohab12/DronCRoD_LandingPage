from __future__ import annotations

import logging
import threading
import time
from typing import Optional

import cv2
import numpy as np

from .config import (
    PERSON_CLASS_ID,
    YOLO_CFG,
    YOLO_WEIGHTS,
    YOLO_WEIGHTS_URL,
    YUNET_ONNX,
    YUNET_URL,
    Settings,
)
from .download import ensure_file
from .detections import Detection, clip_box
from .identity import IdentityEngine

log = logging.getLogger("reconocimiento")


class HumanDetector:
    """Detecta personas (YOLO) y rostros (YuNet), con fallback OpenCV si falla la descarga."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.yolo: Optional[cv2.dnn.DetectionModel] = None
        self.yunet: Optional[cv2.FaceDetectorYN] = None
        self.hog: Optional[cv2.HOGDescriptor] = None
        self.haar: Optional[cv2.CascadeClassifier] = None
        self.identity: Optional[IdentityEngine] = None
        self.backend = "CPU"

        self._init_person_detector()
        if settings.enable_faces:
            self._init_face_detector()
        if settings.enable_identity:
            self.identity = IdentityEngine(settings)

    def _init_person_detector(self) -> None:
        try:
            ensure_file(YOLO_WEIGHTS, YOLO_WEIGHTS_URL)
            if not YOLO_CFG.exists():
                raise FileNotFoundError(f"Falta {YOLO_CFG}")

            net = cv2.dnn.readNetFromDarknet(str(YOLO_CFG), str(YOLO_WEIGHTS))
            self.backend = _prefer_backend(net)
            model = cv2.dnn.DetectionModel(net)
            model.setInputParams(scale=1 / 255.0, size=(416, 416), swapRB=True, crop=False)
            self.yolo = model
            dummy = np.zeros((416, 416, 3), dtype=np.uint8)
            model.detect(dummy, confThreshold=self.settings.confidence, nmsThreshold=self.settings.nms_threshold)
            log.info("Detector de personas: YOLOv4-tiny (%s)", self.backend)
        except Exception as exc:
            log.warning("YOLO no disponible (%s). Usando HOG de respaldo.", exc)
            hog = cv2.HOGDescriptor()
            hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
            self.hog = hog
            log.info("Detector de personas: HOG (respaldo, más lento)")

    def _init_face_detector(self) -> None:
        try:
            ensure_file(YUNET_ONNX, YUNET_URL)
            self.yunet = cv2.FaceDetectorYN.create(
                model=str(YUNET_ONNX),
                config="",
                input_size=(320, 320),
                score_threshold=max(0.5, self.settings.confidence),
                nms_threshold=0.3,
                top_k=50,
            )
            log.info("Detector de rostros: YuNet")
            dummy = np.zeros((320, 320, 3), dtype=np.uint8)
            self.yunet.setInputSize((320, 320))
            self.yunet.detect(dummy)
        except Exception as exc:
            log.warning("YuNet no disponible (%s). Usando Haar de respaldo.", exc)
            path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            cascade = cv2.CascadeClassifier(path)
            if cascade.empty():
                log.error("Tampoco se pudo cargar Haar Cascade. Sin detección facial.")
                return
            self.haar = cascade
            log.info("Detector de rostros: Haar Cascade (respaldo)")

    def detect(self, frame: np.ndarray) -> list[Detection]:
        people = self._detect_people(frame)
        faces: list[Detection] = []
        if self.settings.enable_faces:
            faces = self._detect_faces(frame)
        if self.identity is not None:
            for face in faces:
                name, score = self.identity.identify(frame, face)
                face.identity = name
                face.identity_score = score
        return people + faces

    def reload_identities(self) -> int:
        if self.identity is None:
            return 0
        return self.identity.reload()

    def _detect_people(self, frame: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        if self.yolo is not None:
            detected = self.yolo.detect(
                frame,
                confThreshold=self.settings.confidence,
                nmsThreshold=self.settings.nms_threshold,
            )
            results: list[Detection] = []
            if detected is None or len(detected) != 3:
                return results
            class_ids, confidences, boxes = detected
            if boxes is None or len(boxes) == 0:
                return results
            class_ids = np.array(class_ids).reshape(-1)
            confidences = np.array(confidences).reshape(-1)
            for class_id, conf, box in zip(class_ids, confidences, boxes):
                if int(class_id) != PERSON_CLASS_ID:
                    continue
                x, y, bw, bh = (int(v) for v in box)
                x, y, bw, bh = clip_box(x, y, bw, bh, w, h)
                results.append(Detection("persona", x, y, bw, bh, float(conf)))
            return results

        if self.hog is None:
            return []

        scale = min(1.0, 480 / float(w))
        small = cv2.resize(frame, (int(w * scale), int(h * scale))) if scale < 1.0 else frame
        boxes, weights = self.hog.detectMultiScale(
            small,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.15,
        )
        results = []
        for (x, y, bw, bh), weight in zip(boxes, weights):
            x = int(x / scale)
            y = int(y / scale)
            bw = int(bw / scale)
            bh = int(bh / scale)
            x, y, bw, bh = clip_box(x, y, bw, bh, w, h)
            results.append(Detection("persona", x, y, bw, bh, float(weight)))
        return results

    def _detect_faces(self, frame: np.ndarray) -> list[Detection]:
        h, w = frame.shape[:2]
        if self.yunet is not None:
            self.yunet.setInputSize((w, h))
            _retval, faces = self.yunet.detect(frame)
            results: list[Detection] = []
            if faces is None:
                return results
            for face in faces:
                x, y, bw, bh = (int(v) for v in face[:4])
                conf = float(face[-1])
                x, y, bw, bh = clip_box(x, y, bw, bh, w, h)
                landmarks = tuple(float(v) for v in face)
                results.append(Detection("rostro", x, y, bw, bh, conf, landmarks=landmarks))
            return results

        if self.haar is None:
            return []

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        boxes = self.haar.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=6, minSize=(48, 48))
        results = []
        for x, y, bw, bh in boxes:
            x, y, bw, bh = clip_box(int(x), int(y), int(bw), int(bh), w, h)
            results.append(Detection("rostro", x, y, bw, bh, 0.7))
        return results


def _prefer_backend(net: cv2.dnn.Net) -> str:
    try:
        if cv2.cuda.getCudaEnabledDeviceCount() > 0:
            net.setPreferableBackend(cv2.dnn.DNN_BACKEND_CUDA)
            net.setPreferableTarget(cv2.dnn.DNN_TARGET_CUDA)
            return "CUDA"
    except Exception:
        pass
    net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
    net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
    return "CPU"


class ThreadedDetector:
    """Corre la red en segundo plano para que la ventana nunca se congele."""

    def __init__(self, detector: HumanDetector) -> None:
        self._detector = detector
        self.backend = detector.backend
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._detections: list[Detection] = []
        self._seq = 0
        self._running = True
        self._thread = threading.Thread(target=self._loop, name="detector", daemon=True)
        self._thread.start()

    def submit(self, frame: np.ndarray) -> None:
        with self._lock:
            self._frame = frame.copy()

    def latest(self) -> tuple[list[Detection], int]:
        with self._lock:
            return list(self._detections), self._seq

    def stop(self) -> None:
        self._running = False
        self._thread.join(timeout=1.5)

    def _loop(self) -> None:
        while self._running:
            with self._lock:
                frame = self._frame
                self._frame = None
            if frame is None:
                time.sleep(0.005)
                continue
            detections = self._detector.detect(frame)
            with self._lock:
                self._detections = detections
                self._seq += 1
