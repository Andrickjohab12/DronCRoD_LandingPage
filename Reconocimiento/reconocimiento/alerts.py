from __future__ import annotations

import logging
import sys
import threading

log = logging.getLogger("reconocimiento")


def notify_new_target(track_id: int, enabled: bool, identity: str | None = None) -> None:
    if not enabled:
        return
    threading.Thread(target=_beep, args=(track_id, identity), daemon=True).start()


def _beep(track_id: int, identity: str | None) -> None:
    try:
        if sys.platform.startswith("win"):
            import winsound

            if identity:
                winsound.Beep(880, 120)
                winsound.Beep(1175, 140)
                winsound.Beep(1568, 180)
            else:
                winsound.Beep(980, 140)
                winsound.Beep(1310, 160)
        else:
            print("\a", end="", flush=True)
    except Exception as exc:
        log.debug("Sin audio (%s) · objetivo #%s", exc, track_id)
