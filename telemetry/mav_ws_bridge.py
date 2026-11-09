# mav_ws_bridge.py  — v2.0  (telemetría + comandos bidireccional)
import asyncio
import json
import time
import threading
import serial.tools.list_ports
from pymavlink import mavutil
from pymavlink.dialects.v20 import ardupilotmega as mavlink2
import websockets
from colorama import Fore, Style, init

init(autoreset=True)

BAUD_RATE = 57600
UDP_PORT  = 14540 # MAVLink UDP para simuladores como SITL anteriormente 14560
WS_PORT   = 8766

# ─── Estado de telemetría ────────────────────────────────────────────────────
telemetry = {
    "battery":    0.0,
    "voltage":    0.0,      # ← NUEVO: voltaje exacto (V)
    "current":    0.0,      # ← NUEVO: corriente (A)
    "satellites": 0,
    "altitude":   0.0,
    "speed":      0.0,
    "heading":    0.0,      # ← NUEVO: rumbo magnético (°)
    "latitude":   0.0,
    "longitude":  0.0,
    "connection": "disconnected",
    "armed":      False,    # ← NUEVO: estado de armado
    "flight_mode":"UNKNOWN",# ← NUEVO: modo de vuelo actual
    "timestamp":  None,
}

# Modos de vuelo ArduCopter → número de modo MAVLink
FLIGHT_MODES = {
    "STABILIZE": 0,
    "ACRO":      1,
    "ALT_HOLD":  2,
    "AUTO":      3,
    "GUIDED":    4,
    "LOITER":    5,
    "RTL":       6,
    "CIRCLE":    7,
    "LAND":      9,
    "DRIFT":     11,
    "SPORT":     13,
    "POSHOLD":   16,
}
# Mapa inverso  número → nombre
MODE_NUM_TO_NAME = {v: k for k, v in FLIGHT_MODES.items()}

clients = set()
mav_connection = None   # referencia global al objeto MAVLink

# ─── WebSocket handlers ──────────────────────────────────────────────────────
async def ws_handler(websocket):
    clients.add(websocket)
    print(Fore.CYAN + f"🔗 Cliente conectado ({len(clients)} total)")
    try:
        # Snapshot inicial
        await websocket.send(json.dumps({"type": "snapshot", "payload": telemetry}))

        # Escuchar comandos entrantes del frontend
        async for raw in websocket:
            try:
                msg = json.loads(raw)
                await handle_command(msg, websocket)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "error", "message": "JSON inválido"}))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)
        print(Fore.YELLOW + f"🔌 Cliente desconectado ({len(clients)} total)")


async def broadcast(data):
    if not clients:
        return
    msg = json.dumps({"type": "update", "payload": data})
    await asyncio.gather(*[c.send(msg) for c in clients], return_exceptions=True)


async def send_ack(websocket, command: str, success: bool, message: str = ""):
    """Envía confirmación de comando al cliente."""
    await websocket.send(json.dumps({
        "type":    "command_ack",
        "command": command,
        "success": success,
        "message": message,
    }))


# ─── Procesador de comandos ──────────────────────────────────────────────────
async def handle_command(msg: dict, websocket):
    global mav_connection
    cmd  = msg.get("command")
    args = msg.get("args", {})

    if mav_connection is None:
        await send_ack(websocket, cmd, False, "Sin conexión MAVLink")
        return

    mav = mav_connection
    print(Fore.MAGENTA + f"📨 Comando recibido: {cmd}  args={args}")

    try:
        # ── ARMAR ─────────────────────────────────────────────────────────────
        if cmd == "arm":
            mav.arducopter_arm()
            print(Fore.GREEN + "✅ Comando ARM enviado")
            await send_ack(websocket, cmd, True, "Comando ARM enviado al dron")

        # ── DESARMAR ──────────────────────────────────────────────────────────
        elif cmd == "disarm":
            mav.arducopter_disarm()
            print(Fore.GREEN + "✅ Comando DISARM enviado")
            await send_ack(websocket, cmd, True, "Comando DISARM enviado al dron")

        # ── DESPEGAR ──────────────────────────────────────────────────────────
        elif cmd == "takeoff":
            altitude = float(args.get("altitude", 5.0))
            # Primero asegurarse de que está en modo GUIDED
            mav.set_mode_apm(FLIGHT_MODES["GUIDED"])
            await asyncio.sleep(0.5)
            mav.arducopter_arm()
            await asyncio.sleep(1.0)
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_NAV_TAKEOFF,
                0, 0, 0, 0, 0, 0, 0, altitude
            )
            print(Fore.GREEN + f"✅ Despegue a {altitude}m enviado")
            await send_ack(websocket, cmd, True, f"Despegando a {altitude} m")

        # ── ATERRIZAR ─────────────────────────────────────────────────────────
        elif cmd == "land":
            mav.mav.command_long_send(
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_CMD_NAV_LAND,
                0, 0, 0, 0, 0, 0, 0, 0
            )
            print(Fore.GREEN + "✅ Comando LAND enviado")
            await send_ack(websocket, cmd, True, "Iniciando aterrizaje")

        # ── RETURN TO LAUNCH ──────────────────────────────────────────────────
        elif cmd == "rtl":
            mav.set_mode_apm(FLIGHT_MODES["RTL"])
            print(Fore.GREEN + "✅ Modo RTL activado")
            await send_ack(websocket, cmd, True, "Regresando al punto de despegue")

        # ── CAMBIAR MODO ──────────────────────────────────────────────────────
        elif cmd == "set_mode":
            mode_name = args.get("mode", "LOITER").upper()
            mode_num  = FLIGHT_MODES.get(mode_name)
            if mode_num is None:
                await send_ack(websocket, cmd, False, f"Modo '{mode_name}' desconocido")
                return
            mav.set_mode_apm(mode_num)
            print(Fore.GREEN + f"✅ Modo {mode_name} activado")
            await send_ack(websocket, cmd, True, f"Modo cambiado a {mode_name}")

        # ── SUBIR / BAJAR ALTITUD RELATIVA ────────────────────────────────────
        elif cmd == "change_altitude":
            delta = float(args.get("delta", 5.0))
            target_alt = telemetry["altitude"] + delta
            # Requiere modo GUIDED
            mav.set_mode_apm(FLIGHT_MODES["GUIDED"])
            await asyncio.sleep(0.3)
            mav.mav.send(mavutil.mavlink.MAVLink_set_position_target_local_ned_message(
                10,
                mav.target_system,
                mav.target_component,
                mavutil.mavlink.MAV_FRAME_LOCAL_OFFSET_NED,
                0b0000111111111000,   # solo posición Z
                0, 0, -delta,         # NED: Z negativo = subir
                0, 0, 0,
                0, 0, 0,
                0, 0
            ))
            accion = f"Subiendo {delta}m" if delta > 0 else f"Bajando {abs(delta)}m"
            await send_ack(websocket, cmd, True, accion)

        # ── MANTENER POSICIÓN (LOITER) ────────────────────────────────────────
        elif cmd == "hold":
            mav.set_mode_apm(FLIGHT_MODES["LOITER"])
            await send_ack(websocket, cmd, True, "Manteniendo posición (Loiter)")

        # ── ORBITAR PUNTO ACTUAL ───────────────────────────────────────────────
        elif cmd == "circle":
            mav.set_mode_apm(FLIGHT_MODES["CIRCLE"])
            await send_ack(websocket, cmd, True, "Modo Circle activado")

        else:
            await send_ack(websocket, cmd, False, f"Comando '{cmd}' no reconocido")

    except Exception as e:
        print(Fore.RED + f"⚠️ Error ejecutando comando '{cmd}': {e}")
        await send_ack(websocket, cmd, False, str(e))


# ─── Conexión MAVLink ────────────────────────────────────────────────────────
def find_pixhawk_port():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        print(Fore.RED + "❌ No se detectan puertos seriales.")
        return None
    print(Fore.CYAN + "🔎 Escaneando puertos seriales...")
    for p in ports:
        desc = (p.description or "").lower()
        print(f"  - {p.device} | {p.description}")
        keywords = ["pixhawk", "fmu", "ardu", "silicon", "ftdi", "usb serial", "drone"]
        if any(k in desc for k in keywords):
            print(Fore.GREEN + f"✅ Pixhawk detectado en {p.device}")
            return p.device

    print(Fore.YELLOW + "⚠️ Probando todos los puertos...")
    for p in ports:
        try:
            mav = mavutil.mavlink_connection(p.device, baud=BAUD_RATE)
            mav.wait_heartbeat(timeout=5)
            mav.close()
            print(Fore.GREEN + f"✅ Heartbeat en {p.device}")
            return p.device
        except Exception:
            pass
    print(Fore.RED + "❌ Ningún puerto válido.")
    return None


def connect_mavlink():
    port = find_pixhawk_port()
    if port:
        try:
            print(Fore.CYAN + f"🔌 Conectando serial {port} @ {BAUD_RATE}...")
            mav = mavutil.mavlink_connection(port, baud=BAUD_RATE)
            mav.wait_heartbeat(timeout=10)
            print(Fore.GREEN + "❤️ Heartbeat recibido.")
            return mav
        except Exception as e:
            print(Fore.RED + f"⚠️ Error serial: {e}")
    try:
        print(Fore.YELLOW + f"🌐 Intentando UDP:{UDP_PORT}...")
        mav = mavutil.mavlink_connection(f"udp:127.0.0.1:{UDP_PORT}", autoreconnect=True)
        mav.wait_heartbeat(timeout=5)
        print(Fore.GREEN + "✅ UDP conectado.")
        return mav
    except Exception as e:
        print(Fore.RED + f"❌ UDP falló ({e}). Reintentando en 5s...")
        time.sleep(5)
        return connect_mavlink()


# ─── Lector de telemetría ────────────────────────────────────────────────────
def start_mavlink(loop):
    global mav_connection

    def reader():
        global mav_connection
        mav = connect_mavlink()
        mav_connection = mav
        last_msg_time  = time.time()

        # Solicitar flujos de datos adicionales
        mav.mav.request_data_stream_send(
            mav.target_system, mav.target_component,
            mavutil.mavlink.MAV_DATA_STREAM_ALL, 4, 1
        )

        while True:
            try:
                msg = mav.recv_match(blocking=True, timeout=2)

                if msg is None:
                    if time.time() - last_msg_time > 5:
                        if telemetry["connection"] != "disconnected":
                            print(Fore.RED + "⚠️ Telemetría perdida. Reconectando...")
                        telemetry["connection"] = "disconnected"
                        mav.close()
                        mav = connect_mavlink()
                        mav_connection = mav
                    continue

                mtype = msg.get_type()
                last_msg_time = time.time()
                telemetry["connection"] = "connected"
                telemetry["timestamp"]  = time.time()

                # ── Batería ──────────────────────────────────────────────────
                if mtype == "SYS_STATUS":
                    if hasattr(msg, "battery_remaining"):
                        telemetry["battery"] = float(msg.battery_remaining)
                    telemetry["voltage"] = round(msg.voltage_battery / 1000.0, 2)
                    telemetry["current"] = round(msg.current_battery / 100.0, 2)
                    print(Fore.YELLOW + f"🔋 {telemetry['battery']}% | {telemetry['voltage']}V | {telemetry['current']}A")

                # ── GPS ───────────────────────────────────────────────────────
                elif mtype == "GPS_RAW_INT":
                    telemetry["satellites"] = getattr(msg, "satellites_visible", telemetry["satellites"])
                    telemetry["latitude"]   = msg.lat / 1e7
                    telemetry["longitude"]  = msg.lon / 1e7
                    telemetry["altitude"]   = msg.alt / 1000.0
                    print(Fore.GREEN + f"📡 {telemetry['satellites']} sats | {telemetry['latitude']:.6f}, {telemetry['longitude']:.6f}")
#revisar
                elif mtype == "ATTITUDE":
                    import math
                    telemetry["pitch"] = round(math.degrees(msg.pitch), 1)
                    telemetry["roll"]  = round(math.degrees(msg.roll), 1)



                # ── HUD ───────────────────────────────────────────────────────
                elif mtype == "VFR_HUD":
                    telemetry["altitude"] = msg.alt
                    telemetry["speed"]    = round(msg.groundspeed, 2)
                    telemetry["heading"]  = msg.heading          # ← NUEVO
                    print(Fore.CYAN + f"✈️  Alt:{telemetry['altitude']}m | Vel:{telemetry['speed']}m/s | HDG:{telemetry['heading']}°")

                # ── Estado del sistema (armado + modo) ────────────────────────
                elif mtype == "HEARTBEAT":
                    armed = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
                    telemetry["armed"] = armed
                    mode_num = msg.custom_mode
                    telemetry["flight_mode"] = MODE_NUM_TO_NAME.get(mode_num, f"MODE_{mode_num}")
                    print(Fore.WHITE + f"💓 Armado:{armed} | Modo:{telemetry['flight_mode']}")

                # Broadcast al frontend
                loop.call_soon_threadsafe(asyncio.create_task, broadcast(telemetry))

            except Exception as e:
                print(Fore.RED + f"⚠️ Error MAVLink: {e}")
                telemetry["connection"] = "disconnected"
                time.sleep(2)

    threading.Thread(target=reader, daemon=True).start()


# ─── Main ────────────────────────────────────────────────────────────────────
async def main():
    loop = asyncio.get_event_loop()
    start_mavlink(loop)

    ws_server = await websockets.serve(ws_handler, "0.0.0.0", WS_PORT)
    print(Fore.MAGENTA + f"🌐 WebSocket en ws://localhost:{WS_PORT}")
    print(Fore.WHITE   + "Esperando conexión de la interfaz web...\n")
    await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())