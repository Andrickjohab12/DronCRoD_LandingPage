"""Local YOLO service. The browser streams webcam frames; nothing is uploaded."""
from __future__ import annotations

import asyncio
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import websockets

HOST = "127.0.0.1"
PORT = 8769
MODEL_NAME = os.getenv("DRONCROD_YOLO_MODEL", "yolo26n-seg.pt")
IMAGE_SIZE = int(os.getenv("DRONCROD_YOLO_SIZE", "640"))
CONFIDENCE = float(os.getenv("DRONCROD_YOLO_CONF", "0.25"))
MAX_DETECTIONS = 150
model: Any = None
model_state = "loading"
model_phase = "Preparando el detector"
model_error: str | None = None
model_load_started = time.monotonic()
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yolo-inference")
cv2: Any = None
np: Any = None
torch: Any = None


def load_model() -> Any:
    # Load heavyweight vision packages off the event loop, after the local
    # WebSocket is already accepting connections. This avoids a false startup
    # timeout while PyTorch/Ultralytics initialize or download model weights.
    global cv2, np, torch, model_phase
    model_phase = "Cargando OpenCV y PyTorch"
    import cv2 as opencv
    import numpy as numpy
    import torch as pytorch
    model_phase = "Iniciando Ultralytics"
    from ultralytics import YOLO

    cv2 = opencv
    np = numpy
    torch = pytorch
    model_phase = f"Descargando/cargando {MODEL_NAME} (requiere internet la primera vez)"
    return YOLO(MODEL_NAME)


def run_inference(frame: np.ndarray) -> dict:
    if model is None:
        raise RuntimeError("El modelo todavía se está cargando.")
    started = time.perf_counter()
    predict_options = {}
    selected_device = os.getenv("DRONCROD_YOLO_DEVICE")
    if selected_device:
        predict_options["device"] = selected_device
    results = model.track(
        source=frame,
        imgsz=IMAGE_SIZE,
        conf=CONFIDENCE,
        iou=0.50,
        max_det=MAX_DETECTIONS,
        half=torch.cuda.is_available(),
        classes=[0],  # COCO class 0 is person; ignore every other object.
        persist=True,
        tracker="bytetrack.yaml",
        verbose=False,
        **predict_options,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000
    result = results[0]
    names = result.names
    detections = []
    if result.boxes is not None:
        track_ids = result.boxes.id
        for index, box in enumerate(result.boxes):
            x1, y1, x2, y2 = (float(value) for value in box.xyxy[0].tolist())
            class_id = int(box.cls[0].item())
            label = str(names.get(class_id, class_id))
            confidence = float(box.conf[0].item())
            track_id = int(track_ids[index].item()) if track_ids is not None else index + 1
            polygon = []
            if result.masks is not None and index < len(result.masks.xy):
                points = result.masks.xy[index]
                if len(points) >= 3:
                    contour = np.asarray(points, dtype=np.float32).reshape(-1, 1, 2)
                    epsilon = max(2.0, cv2.arcLength(contour, True) * 0.003)
                    simplified = cv2.approxPolyDP(contour, epsilon, True).reshape(-1, 2)
                    if len(simplified) > 120:
                        simplified = cv2.approxPolyDP(contour, epsilon * 2.0, True).reshape(-1, 2)
                    polygon = [[round(float(px), 1), round(float(py), 1)] for px, py in simplified]
            detections.append({
                "x": x1, "y": y1, "width": x2 - x1, "height": y2 - y1,
                "label": label, "confidence": confidence, "trackId": track_id, "polygon": polygon,
            })
    return {
        "type": "detections",
        "detections": detections,
        "personCount": len(detections),
        "inferenceMs": round(elapsed_ms, 1),
        "width": int(frame.shape[1]),
        "height": int(frame.shape[0]),
    }


async def load_model_in_background() -> None:
    global model, model_state, model_error, model_phase, model_load_started
    loop = asyncio.get_running_loop()
    model_state = "loading"
    model_phase = "Preparando el detector"
    model_load_started = time.monotonic()
    try:
        model = await loop.run_in_executor(executor, load_model)
        model_state = "ready"
        model_phase = "Modelo listo"
        print(f"YOLO listo: {MODEL_NAME} · entrada {IMAGE_SIZE}px · escuchando en ws://{HOST}:{PORT}")
    except Exception as exc:  # report actionable startup error to the UI
        model_state = "error"
        model_phase = "No se pudo cargar el modelo"
        model_error = str(exc)
        print(f"No se pudo cargar {MODEL_NAME}: {exc}")


async def handler(websocket) -> None:
    last_status = None
    while model_state == "loading":
        status = {
            "type": "loading", "model": MODEL_NAME, "status": model_phase,
            "elapsedSeconds": int(time.monotonic() - model_load_started),
        }
        serialized = json.dumps(status)
        if serialized != last_status:
            await websocket.send(serialized)
            last_status = serialized
        await asyncio.sleep(2)
    if model_state == "error":
        await websocket.send(json.dumps({"type": "error", "model": MODEL_NAME, "error": model_error}))
        return
    await websocket.send(json.dumps({"type": "ready", "model": MODEL_NAME}))
    loop = asyncio.get_running_loop()
    async for message in websocket:
        if not isinstance(message, bytes):
            continue
        if model_state != "ready":
            await websocket.send(json.dumps({"type": model_state, "model": MODEL_NAME, "error": model_error}))
            continue
        image_bytes = np.frombuffer(message, dtype=np.uint8)
        frame = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
        if frame is None:
            await websocket.send(json.dumps({"type": "error", "error": "No se pudo leer un fotograma de la cámara."}))
            continue
        try:
            result = await loop.run_in_executor(executor, run_inference, frame)
            await websocket.send(json.dumps(result))
        except Exception as exc:
            await websocket.send(json.dumps({"type": "error", "error": str(exc)}))


async def main() -> None:
    asyncio.create_task(load_model_in_background())
    local_origins = [re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")]
    async with websockets.serve(handler, HOST, PORT, origins=local_origins, max_size=4 * 1024 * 1024, compression=None, ping_interval=20):
        print(f"Servicio DronCRoD disponible en ws://{HOST}:{PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Servicio detenido.")
