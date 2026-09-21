# RECONOCIMIENTO

Detecta personas, les asigna un ID y **reconoce quiénes son** comparando el rostro contra fotos en `faces/`.

## Identidades

El nombre sale del archivo:

```
faces/Andrick.jpg          →  Andrick
faces/Maria.png            →  Maria
faces/Andrick/foto2.jpg    →  Andrick   (carpeta = nombre)
```

Ya está enrolado `faces/Andrick.jpg`. Para agregar a alguien más, deja otra foto y pulsa `R` en vivo, o reinicia.

## Ejecución

```bash
pip install -r requirements.txt
python main.py
```

O `iniciar.bat`. La primera vez descarga el modelo SFace (~37 MB).

```bash
python main.py --id-threshold 0.32
python main.py --no-identity
```

| Tecla | Acción |
| --- | --- |
| `Q` / `Esc` | Salir |
| `S` | Captura manual |
| `Espacio` | Pausar |
| `G` | Galería de eventos |
| `R` | Recargar fotos de `faces/` |
| `M` | Audio on/off |
| `C` | Lista de cámaras (también el botón CAMARA) |

Si te marca DESCONOCIDO siendo tú, baja el umbral (`--id-threshold 0.30`) o agrega una segunda foto tuya (misma iluminación que la webcam).

## Eventos

Cuando aparece un humano nuevo: foto + clip + JSON. Si el rostro coincide con la galería, la caja dice **ANDRICK** (verde). Si no, **DESCONOCIDO**.

`captures/index.html` lista los eventos. `logs/app.log` el registro.

## Ubicación (dron)

```bash
set LOCATION_NAME=Base norte
set DRONE_LAT=19.432608
set DRONE_LON=-99.133209
set DRONE_ALT=35.5
python main.py
```

## Cámara

Cierra Zoom/Teams si no abre. `python main.py --camera 1`

## SkyDroid 5.8G OTG (analógico)

El receptor entra por USB como una webcam. No uses `iniciar.bat` (eso
abre la cámara de la laptop).

```bash
python main.py --list-cameras
python main.py --source analog
python main.py --source analog --camera 1
```

O `iniciar-analog.bat`.

## Fat Shark Recon HD / Avatar

Los goggles sacan HDMI por USB-C. El PC no habla Avatar: hace falta
cable USB-C→HDMI + tarjeta de captura HDMI-USB. Enciende la captura
**antes** que los goggles, frame rate Standard (60 Hz).

```bash
python main.py --list-cameras
python main.py --source goggles
python main.py --source goggles --camera 1
```

O `iniciar-goggles.bat`. Detalle en `GuiaUso.txt` sección 10.
