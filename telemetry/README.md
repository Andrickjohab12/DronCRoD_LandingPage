# Telemetría DronCRoD

## Uso local

Instala una vez las dependencias:

```powershell
py -3 -m pip install -r telemetry\requirements.txt
```

Ejecuta `mav_ws_bridge.py`. El dashboard local usa `ws://127.0.0.1:8766`.

## Ver telemetría desde Vercel

Ejecuta `iniciar-web.bat` con el radio SiK conectado por USB.

La primera vez:

1. El script solicita la URL principal del proyecto en Vercel.
2. Descarga Cloudflare Tunnel en `telemetry/.tools`.
3. Inicia el puente MAVLink y un canal WSS temporal.
4. Abre el dashboard y copia al portapapeles el enlace que también puede abrirse en el móvil.

El canal público usa el puerto `8768` y es de **solo lectura**. Los comandos de vuelo permanecen disponibles únicamente en la conexión local del puerto `8766`.

La URL temporal cambia cada vez que se reinicia el túnel. Ejecuta nuevamente `iniciar-web.bat` para generar el enlace actualizado.

## URL WSS estable en Vercel

Si se configura un túnel permanente con dominio propio, crea en Vercel:

```text
NEXT_PUBLIC_TELEMETRY_WS_URL=wss://telemetria.tu-dominio.com
```

En Vercel: **Project → Settings → Environment Variables**, agrega la variable para Production, Preview y Development y vuelve a desplegar. El hostname debe apuntar mediante Cloudflare Tunnel al servicio local `http://127.0.0.1:8768`.
