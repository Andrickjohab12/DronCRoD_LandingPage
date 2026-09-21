from __future__ import annotations

import logging
import ssl
import urllib.request
from pathlib import Path

log = logging.getLogger("reconocimiento")


def download_file(url: str, dest: Path, timeout: int = 120) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    log.info("Descargando %s", dest.name)

    context = ssl.create_default_context()
    request = urllib.request.Request(url, headers={"User-Agent": "Reconocimiento/2.0"})

    try:
        with urllib.request.urlopen(request, timeout=timeout, context=context) as resp:
            _stream_to_file(resp, tmp)
    except Exception as first_error:
        log.warning("Descarga con SSL estricto falló (%s). Reintentando...", first_error)
        insecure = ssl._create_unverified_context()
        with urllib.request.urlopen(request, timeout=timeout, context=insecure) as resp:
            _stream_to_file(resp, tmp)

    if tmp.stat().st_size < 10_000:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"El archivo descargado es demasiado pequeño: {dest.name}")

    tmp.replace(dest)
    log.info("Modelo listo: %s (%.1f MB)", dest.name, dest.stat().st_size / 1_048_576)


def _stream_to_file(resp, tmp: Path) -> None:
    total = int(resp.headers.get("Content-Length") or 0)
    read = 0
    with open(tmp, "wb") as fh:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            fh.write(chunk)
            read += len(chunk)
            if total:
                pct = read * 100 / total
                print(f"\r  {tmp.name.replace('.part', '')}: {pct:5.1f}% ({read // 1024} KB)", end="", flush=True)
            else:
                print(f"\r  {tmp.name.replace('.part', '')}: {read // 1024} KB", end="", flush=True)
    print()


def ensure_file(path: Path, url: str) -> Path:
    if path.exists() and path.stat().st_size > 10_000:
        return path
    download_file(url, path)
    return path


def ensure_file_from_urls(path: Path, urls: tuple[str, ...] | list[str]) -> Path:
    if path.exists() and path.stat().st_size > 10_000:
        return path
    errors: list[str] = []
    for url in urls:
        try:
            download_file(url, path)
            return path
        except Exception as exc:
            errors.append(f"{url} → {exc}")
            log.warning("No se pudo bajar desde %s", url)
    raise RuntimeError("No se pudo descargar " + path.name + ". " + " | ".join(errors))
