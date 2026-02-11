# mav_ws_bridge.py
import asyncio
import json
import time
import threading
import serial.tools.list_ports
from pymavlink import mavutil
import websockets
from colorama import Fore, Style, init

# Inicializa colorama para imprimir con color
init(autoreset=True)

# Configuración base
BAUD_RATE = 57600
UDP_PORT = 14560
WS_PORT = 8766

telemetry = {
    "battery": 0.0,
    "satellites": 0,
    "altitude": 0.0,
    "speed": 0.0,
    "latitude": 0.0,
    "longitude": 0.0,
    "connection": "disconnected",
    "timestamp": None
}

clients = set()

async def ws_handler(websocket):
    clients.add(websocket)
    try:
        await websocket.send(json.dumps({"type": "snapshot", "payload": telemetry}))
        async for _ in websocket:
            pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.remove(websocket)

async def broadcast(data):
    if not clients:
        return
    msg = json.dumps({"type": "update", "payload": data})
    await asyncio.gather(*[c.send(msg) for c in clients], return_exceptions=True)


def find_pixhawk_port():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print(Fore.RED + "❌ No se detectan puertos seriales disponibles.")
        return None

    print(Fore.CYAN + "🔎 Escaneando puertos seriales disponibles...")
    for p in ports:
        desc = (p.description or "").lower()
        vid = f"VID:{p.vid}" if p.vid else ""
        pid = f"PID:{p.pid}" if p.pid else ""
        print(f"  - {p.device} | {p.description} {vid} {pid}")

        # Palabras clave típicas de Pixhawk / Telemetría
        keywords = ["pixhawk", "fmu", "ardu", "silicon", "ftdi", "usb serial", "drone"]
        if any(k in desc for k in keywords):
            print(Fore.GREEN + f"✅ Dispositivo Pixhawk detectado en {p.device}")
            return p.device

    print(Fore.YELLOW + "⚠️ No se encontró Pixhawk por nombre. Intentando conexión en todos los puertos...")
    for p in ports:
        try:
            print(Fore.CYAN + f"⏳ Probando conexión en {p.device} ...")
            mav = mavutil.mavlink_connection(f"serial:{p.device}", baud=BAUD_RATE)
            mav.wait_heartbeat(timeout=5)
            print(Fore.GREEN + f"✅ Conectado correctamente en {p.device}")
            mav.close()
            return p.device
        except Exception:
            pass

    print(Fore.RED + "❌ Ningún puerto válido encontrado.")
    return None

# ============================================================
# 🚁 CONEXIÓN MAVLINK SERIAL O UDP
# ============================================================
def connect_mavlink():
    port = find_pixhawk_port()
    if port:
        try:
            print(Fore.CYAN + f"🔌 Intentando conexión serial directa en {port} @ {BAUD_RATE}...")
            
            # pymavlink en Windows NO acepta 'serial:COMx' → usar solo el nombre del puerto
            mav = mavutil.mavlink_connection(port, baud=BAUD_RATE)
            print(Fore.GREEN + f"✅ Conectado correctamente a Pixhawk en {port}. Esperando latidos (heartbeat)...")
            mav.wait_heartbeat(timeout=10)
            print(Fore.GREEN + "❤️ Heartbeat recibido del dron.")
            return mav
        except Exception as e:
            print(Fore.RED + f"⚠️ Error conectando al Pixhawk ({e}).")
    
    # Si no hay conexión serial, intenta UDP como respaldo
    try:
        print(Fore.YELLOW + f"🌐 Intentando conexión por UDP en puerto {UDP_PORT}...")
        mav = mavutil.mavlink_connection(f"udp:127.0.0.1:{UDP_PORT}", autoreconnect=True)
        mav.wait_heartbeat(timeout=5)
        print(Fore.GREEN + "✅ Conectado por UDP.")
        return mav
    except Exception as e:
        print(Fore.RED + f"❌ No se pudo conectar por UDP ({e}). Reintentando en 5s...")
        time.sleep(5)
        return connect_mavlink()


# ============================================================
# 📡 LECTOR DE TELEMETRÍA
# ============================================================
def start_mavlink(loop):
    def reader():
        mav = connect_mavlink()
        last_message_time = time.time()

        while True:
            try:
                msg = mav.recv_match(blocking=True, timeout=2)
                if msg is None:
                    if time.time() - last_message_time > 5:
                        if telemetry["connection"] != "disconnected":
                            print(Fore.RED + "⚠️ Telemetría perdida. Intentando reconectar...")
                        telemetry["connection"] = "disconnected"
                        mav.close()
                        mav = connect_mavlink()
                    continue

                mtype = msg.get_type()
                last_message_time = time.time()
                telemetry["connection"] = "connected"
                telemetry["timestamp"] = time.time()

                if mtype == "SYS_STATUS" and hasattr(msg, "battery_remaining"):
                    telemetry["battery"] = float(msg.battery_remaining)
                    print(Fore.YELLOW + f"🔋 Batería: {telemetry['battery']} %")

                elif mtype == "GPS_RAW_INT":
                    telemetry["satellites"] = getattr(msg, "satellites_visible", telemetry["satellites"])
                    telemetry["latitude"] = msg.lat / 1e7
                    telemetry["longitude"] = msg.lon / 1e7
                    telemetry["altitude"] = msg.alt / 1000.0
                    print(Fore.GREEN + f"📡 GPS: {telemetry['satellites']} sats | "
                          f"Lat: {telemetry['latitude']:.6f}, Lon: {telemetry['longitude']:.6f}")

                elif mtype == "VFR_HUD":
                    telemetry["altitude"] = msg.alt
                    telemetry["speed"] = msg.groundspeed
                    print(Fore.CYAN + f"✈️  Altitud: {telemetry['altitude']} m | Vel: {telemetry['speed']:.2f} m/s")

                # Enviar actualización al WebSocket
                loop.call_soon_threadsafe(asyncio.create_task, broadcast(telemetry))

            except Exception as e:
                print(Fore.RED + f"⚠️ Error leyendo MAVLink: {e}")
                telemetry["connection"] = "disconnected"
                time.sleep(2)

    threading.Thread(target=reader, daemon=True).start()

# ============================================================
# 🧠 MAIN ASYNCIO SERVER
# ============================================================
async def main():
    loop = asyncio.get_event_loop()
    start_mavlink(loop)

    ws_server = await websockets.serve(ws_handler, "0.0.0.0", WS_PORT)
    print(Fore.MAGENTA + f"🌐 Servidor WebSocket en ws://localhost:{WS_PORT}")
    print(Fore.WHITE + "Esperando conexión de la interfaz web...\n")
    await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
