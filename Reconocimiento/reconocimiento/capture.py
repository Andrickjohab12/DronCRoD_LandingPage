from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Optional, Sequence

import cv2
import numpy as np

from .config import CAPTURE_DIR, Settings
from .detections import Detection, count_by_label
from .gallery import rebuild_gallery

log = logging.getLogger("reconocimiento")


class CaptureStore:
    def __init__(self, settings: Settings, session_id: str) -> None:
        self.settings = settings
        self.session_id = session_id
        CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
        self.journal = CAPTURE_DIR / f"session_{session_id}.jsonl"

    def save(
        self,
        frame: np.ndarray,
        detections: Sequence[Detection],
        *,
        event_type: str = "manual",
        track_id: Optional[int] = None,
        extra: Optional[dict[str, Any]] = None,
    ) -> Path:
        now = datetime.now()
        stamp = now.strftime("%Y%m%d_%H%M%S")
        people = count_by_label(detections, "persona")
        faces = count_by_label(detections, "rostro")
        identities = [d.identity for d in detections if d.identity]
        if identities:
            kind = identities[0].replace(" ", "_")
        elif people:
            kind = "persona"
        elif faces:
            kind = "desconocido"
        else:
            kind = "escena"
        event_id = uuid.uuid4().hex[:10]
        filename = f"{kind}_{stamp}_{event_id}.jpg"
        image_path = CAPTURE_DIR / filename

        ok = cv2.imwrite(str(image_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        if not ok:
            raise RuntimeError(f"No se pudo guardar la imagen en {image_path}")

        payload: dict[str, Any] = {
            "id": event_id,
            "session_id": self.session_id,
            "event_type": event_type,
            "track_id": track_id,
            "timestamp": now.strftime("%Y-%m-%d %H:%M:%S"),
            "date_iso": now.strftime("%Y-%m-%d"),
            "time_iso": now.strftime("%H:%M:%S"),
            "location": self.settings.location_name,
            "latitude": self.settings.latitude,
            "longitude": self.settings.longitude,
            "altitude_m": self.settings.altitude_m,
            "source": self.settings.source_name,
            "people_count": people,
            "faces_count": faces,
            "identity": identities[0] if identities else None,
            "identities": identities,
            "image_file": filename,
            "video_file": None,
            "detections": [
                {
                    "type": det.label,
                    "track_id": det.track_id,
                    "identity": det.identity,
                    "identity_score": round(det.identity_score, 4) if det.identity else None,
                    "bbox": [det.x, det.y, det.w, det.h],
                    "confidence": round(det.confidence, 4),
                }
                for det in detections
            ],
        }
        if extra:
            payload.update(extra)

        json_path = image_path.with_suffix(".json")
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        with self.journal.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(payload, ensure_ascii=False) + "\n")
        rebuild_gallery()
        log.info(
            "Evento %s · %s · objetivo=%s · identidad=%s · personas=%s rostros=%s",
            event_type,
            filename,
            track_id if track_id is not None else "-",
            identities[0] if identities else "-",
            people,
            faces,
        )
        return image_path

    def attach_video(self, image_path: Path, video_path: Path) -> None:
        json_path = image_path.with_suffix(".json")
        if not json_path.exists():
            return
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        payload["video_file"] = video_path.name
        json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        rebuild_gallery()
