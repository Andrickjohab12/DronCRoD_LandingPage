from __future__ import annotations

import json
from datetime import datetime
from html import escape
from pathlib import Path

from .config import CAPTURE_DIR


def rebuild_gallery() -> Path:
    events = []
    for json_path in sorted(CAPTURE_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        image = data.get("image_file")
        if not image or not (CAPTURE_DIR / image).exists():
            continue
        events.append(data)

    cards = []
    for item in events[:200]:
        image = escape(str(item.get("image_file", "")))
        video = item.get("video_file")
        video_html = (
            f'<video controls preload="metadata" src="{escape(str(video))}"></video>'
            if video and (CAPTURE_DIR / str(video)).exists()
            else ""
        )
        track = item.get("track_id")
        track_label = f"#{track}" if track is not None else "—"
        identity = item.get("identity") or "Desconocido"
        cards.append(
            f"""
            <article class="card">
              <img src="{image}" alt="evento {escape(str(item.get('id', '')))}">
              {video_html}
              <div class="meta">
                <div class="row">
                  <span class="id">{escape(str(identity))} · OBJ {track_label}</span>
                  <span class="when">{escape(str(item.get('timestamp', '')))}</span>
                </div>
                <div class="row dim">
                  {escape(str(item.get('location', '')))} ·
                  personas {item.get('people_count', 0)} · rostros {item.get('faces_count', 0)}
                </div>
              </div>
            </article>
            """
        )

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>RECONOCIMIENTO · Galería</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{
      margin: 0; font-family: Segoe UI, sans-serif;
      background: #0b0f14; color: #e8eef4;
    }}
    header {{
      padding: 24px 32px; border-bottom: 1px solid #1c2a36;
      display: flex; justify-content: space-between; align-items: baseline;
    }}
    h1 {{ margin: 0; font-size: 20px; letter-spacing: .12em; color: #50c8c6; }}
    .sub {{ color: #8aa0b2; font-size: 13px; }}
    main {{
      padding: 24px; display: grid; gap: 18px;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    }}
    .card {{
      background: #121922; border: 1px solid #1e2d3a; border-radius: 10px; overflow: hidden;
    }}
    img, video {{ width: 100%; display: block; background: #000; }}
    .meta {{ padding: 12px 14px; font-size: 13px; }}
    .row {{ display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }}
    .dim {{ color: #8aa0b2; }}
    .id {{ color: #d6c850; }}
  </style>
</head>
<body>
  <header>
    <h1>RECONOCIMIENTO</h1>
    <div class="sub">{len(events)} eventos · actualizado {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</div>
  </header>
  <main>
    {"".join(cards) if cards else "<p class='sub' style='padding:12px'>Aún no hay eventos.</p>"}
  </main>
</body>
</html>
"""
    out = CAPTURE_DIR / "index.html"
    CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out
