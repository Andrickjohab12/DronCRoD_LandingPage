from __future__ import annotations

import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import TYPE_CHECKING, Optional
from urllib.parse import parse_qs, urlparse

import cv2
import numpy as np

if TYPE_CHECKING:
    from .app import RecognitionApp

log = logging.getLogger("reconocimiento")

BOUNDARY = b"frame"


class FrameBus:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jpeg: Optional[bytes] = None
        self._version = 0
        self._event = threading.Event()

    def publish_bgr(self, frame: np.ndarray) -> None:
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 78])
        if not ok:
            return
        with self._lock:
            self._jpeg = buf.tobytes()
            self._version += 1
        self._event.set()
        self._event.clear()

    def wait_jpeg(self, last_version: int, timeout: float = 1.0) -> tuple[int, Optional[bytes]]:
        if self.version() == last_version:
            self._event.wait(timeout)
        with self._lock:
            return self._version, self._jpeg

    def version(self) -> int:
        with self._lock:
            return self._version


class StreamServer:
    def __init__(self, app: "RecognitionApp", port: int) -> None:
        self.app = app
        self.port = port
        self.bus = FrameBus()
        self._httpd: Optional[ThreadingHTTPServer] = None
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        handler = _make_handler(self)
        self._httpd = ThreadingHTTPServer(("0.0.0.0", self.port), handler)
        self._thread = threading.Thread(target=self._httpd.serve_forever, name="mjpeg", daemon=True)
        self._thread.start()
        log.info("Stream dashboard en http://127.0.0.1:%s/video_feed", self.port)

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()

    def publish(self, frame: np.ndarray) -> None:
        self.bus.publish_bgr(frame)

    def publish_status(self, title: str, subtitle: str) -> None:
        canvas = np.zeros((720, 1280, 3), dtype=np.uint8)
        cv2.putText(canvas, "RECONOCIMIENTO", (80, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 210, 255), 3, cv2.LINE_AA)
        cv2.putText(canvas, title, (80, 370), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(canvas, subtitle, (80, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (160, 160, 160), 1, cv2.LINE_AA)
        self.publish(canvas)


def _cors(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Cache-Control", "no-cache, no-store, must-revalidate")


def _make_handler(server: StreamServer):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, _fmt: str, *_args) -> None:
            return

        def do_OPTIONS(self) -> None:
            self.send_response(204)
            _cors(self)
            self.end_headers()

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/video_feed":
                self._mjpeg()
                return
            if path == "/api/status":
                self._json(200, server.app.stream_status())
                return
            if path == "/api/cameras":
                query = parse_qs(urlparse(self.path).query)
                refresh = (query.get("refresh") or ["0"])[0] in {"1", "true", "yes"}
                self._json(200, {"cameras": server.app.stream_cameras(refresh=refresh)})
                return
            if path in {"/", "/health"}:
                self._json(200, {"ok": True, "ready": server.app.stream_ready()})
                return
            self._json(404, {"error": "not found"})

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            try:
                payload = json.loads(raw.decode("utf-8") or "{}")
            except json.JSONDecodeError:
                payload = {}
            if path in {"/api/camera", "/api/cameras", "/api/cameras/select"}:
                try:
                    index = int(payload.get("index", -1))
                except (TypeError, ValueError):
                    self._json(400, {"ok": False, "message": "Indice de camara invalido"})
                    return
                ok, message = server.app.stream_select_camera(index)
                self._json(200 if ok else 400, {"ok": ok, "message": message, "cameras": server.app.stream_cameras()})
                return
            if path in {"/api/command", "/api/control"}:
                cmd = str(payload.get("cmd") or payload.get("command") or "").strip()
                if not cmd:
                    self._json(400, {"ok": False, "message": "Falta cmd"})
                    return
                extra = {k: v for k, v in payload.items() if k not in {"cmd", "command", "type"}}
                result = server.app.stream_command(cmd, extra)
                self._json(200 if result.get("ok") else 400, result)
                return
            if path == "/api/shutdown":
                self._json(200, {"ok": True})
                threading.Thread(target=server.app.request_stop, daemon=True).start()
                return
            self._json(404, {"error": "not found"})

        def _json(self, code: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            try:
                self.send_response(code)
                _cors(self)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return

        def _mjpeg(self) -> None:
            self.send_response(200)
            _cors(self)
            self.send_header("Age", "0")
            self.send_header("Content-Type", f"multipart/x-mixed-replace; boundary={BOUNDARY.decode()}")
            self.end_headers()
            last = -1
            try:
                while not server.app.stop_requested():
                    last, jpeg = server.bus.wait_jpeg(last, timeout=1.0)
                    if jpeg is None:
                        continue
                    self.wfile.write(b"--" + BOUNDARY + b"\r\n")
                    self.wfile.write(b"Content-Type: image/jpeg\r\n")
                    self.wfile.write(f"Content-Length: {len(jpeg)}\r\n\r\n".encode("ascii"))
                    self.wfile.write(jpeg)
                    self.wfile.write(b"\r\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
                return

    return Handler
