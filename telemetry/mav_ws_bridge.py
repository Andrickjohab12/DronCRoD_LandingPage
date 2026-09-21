# mav_ws_bridge.py
"""Puente SiK / MAVLink -> WebSocket para el dashboard DronCRoD."""
from __future__ import annotations

import asyncio
import json
import math
import socket
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import serial.tools.list_ports
import websockets
from colorama import Fore, Style, init
from pymavlink import mavutil

init(autoreset=True)

BAUD_RATE = 57600
WS_PORT = 8766
HTTP_PORT = 8767
BROADCAST_HZ = 5.0
LINK_TIMEOUT_S = 2.0

PX4_MAIN = {
    1: "MANUAL",
    2: "ALTCTL",
    3: "POSCTL",
    4: "AUTO",
    5: "ACRO",
    6: "OFFBOARD",
    7: "STABILIZED",
    8: "RATTITUDE",
}
PX4_AUTO_SUB = {
    1: "READY",
    2: "TAKEOFF",
    3: "LOITER",
    4: "MISSION",
    5: "RTL",
    6: "LAND",
    7: "RTGS",
    8: "FOLLOW_ME",
    9: "PRECLAND",
}
PX4_SET_MODE = {
    "MANUAL": (1, 0),
    "ALTCTL": (2, 0),
    "POSCTL": (3, 0),
    "AUTO": (4, 0),
    "LOITER": (4, 3),
    "MISSION": (4, 4),
    "RTL": (4, 5),
    "LAND": (4, 6),
    "TAKEOFF": (4, 2),
    "OFFBOARD": (6, 0),
    "STABILIZED": (7, 0),
    "ACRO": (5, 0),
}
MAV_TYPE_NAME = {
    1: "fixed-wing",
    2: "quadcopter",
    3: "coaxial",
    4: "helicopter",
    13: "hexa",
    14: "octo",
    19: "vtol",
}
MAV_STATE_NAME = {
    0: "UNINIT",
    1: "BOOT",
    2: "CALIBRATING",
    3: "STANDBY",
    4: "ACTIVE",
    5: "CRITICAL",
    6: "EMERGENCY",
    7: "POWEROFF",
    8: "FLIGHT_TERMINATION",
}
GPS_FIX_NAME = {
    0: "NO_GPS",
    1: "NO_FIX",
    2: "2D",
    3: "3D",
    4: "DGPS",
    5: "RTK_FLOAT",
    6: "RTK_FIXED",
}
LANDED_NAME = {0: "INDEFINIDO", 1: "SUELO", 2: "AIRE", 3: "DESPEGUE", 4: "ATERRIZAJE"}
AUTOPILOT_NAME = {3: "ArduPilot", 12: "PX4"}

telemetry: dict[str, Any] = {
    "connection": "disconnected",
    "timestamp": None,
    "port": None,
    "sysid": 0,
    "compid": 0,
    "vehicle_type": "",
    "autopilot": "",
    "mavlink_version": 0,
    "firmware": "",
    "flight_mode": "—",
    "armed": False,
    "system_status": "—",
    "landed_state": "—",
    "battery": 0.0,
    "voltage": 0.0,
    "current": 0.0,
    "battery_temp": None,
    "cpu_load": 0.0,
    "satellites": 0,
    "gps_fix": 0,
    "gps_fix_name": "NO_GPS",
    "hdop": 0.0,
    "vdop": 0.0,
    "gps_speed": 0.0,
    "cog": 0.0,
    "latitude": 0.0,
    "longitude": 0.0,
    "altitude": 0.0,
    "alt_relative": 0.0,
    "alt_amsl": 0.0,
    "speed": 0.0,
    "airspeed": 0.0,
    "climb": 0.0,
    "heading": 0.0,
    "throttle": 0,
    "roll": 0.0,
    "pitch": 0.0,
    "yaw": 0.0,
    "rollspeed": 0.0,
    "pitchspeed": 0.0,
    "yawspeed": 0.0,
    "vx": 0.0,
    "vy": 0.0,
    "vz": 0.0,
    "rssi": None,
    "remote_rssi": None,
    "rc_rssi": None,
    "noise": None,
    "txbuf": None,
    "drop_rate": 0.0,
    "errors_comm": 0,
    "uptime_s": 0.0,
    "mission_seq": 0,
    "mission_total": 0,
    "pressure": 0.0,
    "baro_temp": None,
    "estimator_ok": True,
    "ekf_flags": 0,
    "pos_horiz_acc": 0.0,
    "pos_vert_acc": 0.0,
    "rc_channels": [],
    "servos": [],
    "logs": [],
}

logs: deque[dict[str, Any]] = deque(maxlen=300)
clients: set = set()
mav_lock = threading.Lock()
mav_conn = None
command_queue: deque[dict[str, Any]] = deque()
loop: asyncio.AbstractEventLoop | None = None


def now_ms() -> float:
    return time.time()


def json_safe(value: Any) -> Any:
    if isinstance(value, float) and not math.isfinite(value):
        return 0.0
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    return value


def dumps(message: dict[str, Any]) -> str:
    return json.dumps(json_safe(message), default=str, allow_nan=False)


def add_log(level: str, text: str) -> None:
    item = {"t": now_ms(), "level": level, "text": text}
    logs.append(item)
    telemetry["logs"] = list(logs)[-80:]
    color = {"info": Fore.WHITE, "ok": Fore.GREEN, "warn": Fore.YELLOW, "err": Fore.RED}.get(level, Fore.WHITE)
    try:
        print(color + text)
    except UnicodeEncodeError:
        print(color + text.encode("ascii", "replace").decode("ascii"))
    if loop is not None:
        loop.call_soon_threadsafe(asyncio.create_task, broadcast({"type": "log", "payload": item}))


def serial_device(port: str) -> str:
    if port.upper().startswith("COM"):
        return r"\\.\{}".format(port)
    return port


def find_telemetry_port() -> str | None:
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        add_log("err", "No hay puertos seriales.")
        return None

    add_log("info", "Escaneando puertos seriales...")
    ranked: list[tuple[int, str, str]] = []
    for p in ports:
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        blob = desc + " " + hwid
        score = 0
        if p.vid == 0x0403 and p.pid == 0x6015:
            score += 100
        for word, pts in (
            ("sik", 50),
            ("telemetry", 40),
            ("3dr", 40),
            ("pixhawk", 40),
            ("ftdi", 20),
            ("usb serial", 15),
            ("cp210", 10),
            ("ch340", 10),
        ):
            if word in blob:
                score += pts
        add_log("info", f"  {p.device} | {p.description} VID:{p.vid} PID:{p.pid} ({score})")
        ranked.append((score, p.device, p.description))

    ranked.sort(reverse=True)
    if ranked and ranked[0][0] > 0:
        port = ranked[0][1]
        add_log("ok", f"Radio SiK / telemetría en {port} ({ranked[0][2]})")
        return port
    return ranked[0][1] if ranked else None


def px4_mode(custom_mode: int) -> str:
    main = (custom_mode >> 16) & 0xFF
    sub = (custom_mode >> 24) & 0xFF
    if main == 4:
        return "AUTO." + PX4_AUTO_SUB.get(sub, str(sub))
    return PX4_MAIN.get(main, f"MODE {main}.{sub}")


def request_streams(mav) -> None:
    sysid = mav.target_system or 1
    compid = mav.target_component or 1
    mav.mav.request_data_stream_send(
        sysid, compid, mavutil.mavlink.MAV_DATA_STREAM_ALL, 4, 1
    )
    try:
        for msg_id, hz in (
            (mavutil.mavlink.MAVLINK_MSG_ID_ATTITUDE, 10),
            (mavutil.mavlink.MAVLINK_MSG_ID_VFR_HUD, 5),
            (mavutil.mavlink.MAVLINK_MSG_ID_GPS_RAW_INT, 5),
            (mavutil.mavlink.MAVLINK_MSG_ID_SYS_STATUS, 2),
            (mavutil.mavlink.MAVLINK_MSG_ID_BATTERY_STATUS, 1),
            (mavutil.mavlink.MAVLINK_MSG_ID_RC_CHANNELS, 4),
            (mavutil.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT, 5),
        ):
            mav.mav.command_long_send(
                sysid,
                compid,
                mavutil.mavlink.MAV_CMD_SET_MESSAGE_INTERVAL,
                0,
                msg_id,
                int(1_000_000 / hz),
                0,
                0,
                0,
                0,
                0,
            )
    except Exception:
        pass


def request_version(mav) -> None:
    sysid = mav.target_system or 1
    compid = mav.target_component or 1
    try:
        mav.mav.command_long_send(
            sysid,
            compid,
            mavutil.mavlink.MAV_CMD_REQUEST_MESSAGE,
            0,
            mavutil.mavlink.MAVLINK_MSG_ID_AUTOPILOT_VERSION,
            0,
            0,
            0,
            0,
            0,
            0,
        )
    except Exception:
        mav.mav.autopilot_version_request_send(sysid, compid)


def connect_mavlink():
    global mav_conn
    while True:
        port = find_telemetry_port()
        if not port:
            add_log("warn", "Sin puerto. Reintento en 3s...")
            time.sleep(3)
            continue
        device = serial_device(port)
        try:
            add_log("info", f"Abriendo {port} @ {BAUD_RATE}...")
            mav = mavutil.mavlink_connection(device, baud=BAUD_RATE)
            add_log("info", "Esperando HEARTBEAT del autopiloto...")
            hb = None
            deadline = time.time() + 20
            while time.time() < deadline:
                msg = mav.recv_match(type="HEARTBEAT", blocking=True, timeout=1)
                if msg is None:
                    continue
                if msg.get_srcSystem() == 0:
                    continue
                hb = msg
                if msg.autopilot in (3, 12) or msg.type in (1, 2, 3, 4, 13, 14, 19):
                    break
            if hb is None:
                add_log("err", "Sin HEARTBEAT. ¿Dron y SiK encendidos?")
                mav.close()
                time.sleep(3)
                continue
            mav.target_system = hb.get_srcSystem()
            mav.target_component = hb.get_srcComponent() or 1
            telemetry["port"] = port
            telemetry["sysid"] = mav.target_system
            telemetry["compid"] = mav.target_component
            apply_heartbeat(hb)
            request_streams(mav)
            request_version(mav)
            add_log(
                "ok",
                f"Heartbeat sys {mav.target_system} comp {mav.target_component} · {telemetry['autopilot']} {telemetry['vehicle_type']} · {telemetry['flight_mode']}",
            )
            with mav_lock:
                mav_conn = mav
            telemetry["connection"] = "connected"
            return mav
        except Exception as exc:
            denied = isinstance(exc, PermissionError) or "Acceso denegado" in str(exc) or "Access is denied" in str(exc)
            if denied:
                add_log("err", f"No se pudo abrir {port}: ocupado por otro programa.")
                add_log("warn", "Cierra QGroundControl y deja UN solo python mav_ws_bridge.py")
            else:
                add_log("err", f"No se pudo abrir {port}: {exc}")
            time.sleep(3)


def deg(rad: float) -> float:
    return math.degrees(rad)


def apply_heartbeat(msg) -> None:
    telemetry["vehicle_type"] = MAV_TYPE_NAME.get(msg.type, f"tipo {msg.type}")
    telemetry["autopilot"] = AUTOPILOT_NAME.get(msg.autopilot, f"AP {msg.autopilot}")
    telemetry["mavlink_version"] = int(msg.mavlink_version)
    telemetry["system_status"] = MAV_STATE_NAME.get(msg.system_status, str(msg.system_status))
    telemetry["armed"] = bool(msg.base_mode & mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED)
    if msg.autopilot == 12:
        telemetry["flight_mode"] = px4_mode(int(msg.custom_mode))
    else:
        try:
            telemetry["flight_mode"] = mavutil.mode_string_v10(msg)
        except Exception:
            telemetry["flight_mode"] = str(msg.custom_mode)


def ingest(msg) -> None:
    mtype = msg.get_type()
    if mtype == "BAD_DATA":
        return
    telemetry["timestamp"] = now_ms()
    telemetry["connection"] = "connected"

    if mtype == "HEARTBEAT" and msg.get_srcSystem():
        apply_heartbeat(msg)

    elif mtype == "SYS_STATUS":
        if msg.battery_remaining not in (-1, 255):
            telemetry["battery"] = float(msg.battery_remaining)
        if 0 < msg.voltage_battery < 65535:
            telemetry["voltage"] = msg.voltage_battery / 1000.0
        if msg.current_battery != -1:
            telemetry["current"] = msg.current_battery / 100.0
        telemetry["cpu_load"] = msg.load / 10.0
        telemetry["drop_rate"] = msg.drop_rate_comm / 100.0
        telemetry["errors_comm"] = int(msg.errors_comm)

    elif mtype == "BATTERY_STATUS":
        if msg.battery_remaining not in (-1, 255):
            telemetry["battery"] = float(msg.battery_remaining)
        if msg.current_battery != -1:
            telemetry["current"] = msg.current_battery / 100.0
        if msg.temperature != 32767:
            telemetry["battery_temp"] = msg.temperature / 100.0
        volts = [v / 1000.0 for v in (msg.voltages or []) if 0 < v < 65535]
        if volts:
            telemetry["voltage"] = sum(volts) if len(volts) > 1 and volts[0] < 6 else volts[0]

    elif mtype == "GPS_RAW_INT":
        telemetry["gps_fix"] = int(msg.fix_type)
        telemetry["gps_fix_name"] = GPS_FIX_NAME.get(msg.fix_type, str(msg.fix_type))
        telemetry["satellites"] = int(msg.satellites_visible) if msg.satellites_visible != 255 else 0
        if msg.fix_type >= 2 and abs(msg.lat) > 0:
            telemetry["latitude"] = msg.lat / 1e7
            telemetry["longitude"] = msg.lon / 1e7
        if msg.alt:
            telemetry["alt_amsl"] = msg.alt / 1000.0
            if not telemetry["altitude"]:
                telemetry["altitude"] = telemetry["alt_amsl"]
        if msg.eph != 65535:
            telemetry["hdop"] = msg.eph / 100.0
        if msg.epv != 65535:
            telemetry["vdop"] = msg.epv / 100.0
        if msg.vel != 65535:
            telemetry["gps_speed"] = msg.vel / 100.0
        if msg.cog != 65535:
            telemetry["cog"] = msg.cog / 100.0

    elif mtype == "GLOBAL_POSITION_INT":
        if abs(msg.lat) > 0:
            telemetry["latitude"] = msg.lat / 1e7
            telemetry["longitude"] = msg.lon / 1e7
        telemetry["alt_amsl"] = msg.alt / 1000.0
        telemetry["alt_relative"] = msg.relative_alt / 1000.0
        telemetry["heading"] = msg.hdg / 100.0 if msg.hdg != 65535 else telemetry["heading"]
        telemetry["vx"] = msg.vx / 100.0
        telemetry["vy"] = msg.vy / 100.0
        telemetry["vz"] = msg.vz / 100.0

    elif mtype == "VFR_HUD":
        telemetry["airspeed"] = float(msg.airspeed) if math.isfinite(float(msg.airspeed)) else 0.0
        telemetry["speed"] = float(msg.groundspeed) if math.isfinite(float(msg.groundspeed)) else 0.0
        telemetry["heading"] = float(msg.heading) if math.isfinite(float(msg.heading)) else telemetry["heading"]
        telemetry["throttle"] = int(msg.throttle)
        telemetry["altitude"] = float(msg.alt) if math.isfinite(float(msg.alt)) else telemetry["altitude"]
        telemetry["climb"] = float(msg.climb) if math.isfinite(float(msg.climb)) else 0.0

    elif mtype == "ATTITUDE":
        telemetry["roll"] = deg(msg.roll)
        telemetry["pitch"] = deg(msg.pitch)
        telemetry["yaw"] = (deg(msg.yaw) + 360.0) % 360.0
        telemetry["rollspeed"] = deg(msg.rollspeed)
        telemetry["pitchspeed"] = deg(msg.pitchspeed)
        telemetry["yawspeed"] = deg(msg.yawspeed)
        telemetry["uptime_s"] = msg.time_boot_ms / 1000.0

    elif mtype == "ALTITUDE":
        telemetry["alt_amsl"] = float(msg.altitude_amsl)
        telemetry["alt_relative"] = float(msg.altitude_relative)
        if abs(msg.altitude_relative) > 0.01:
            telemetry["altitude"] = float(msg.altitude_relative)

    elif mtype == "LOCAL_POSITION_NED":
        telemetry["vx"] = float(msg.vx)
        telemetry["vy"] = float(msg.vy)
        telemetry["vz"] = float(msg.vz)
        telemetry["alt_relative"] = -float(msg.z)

    elif mtype == "RC_CHANNELS":
        chans = []
        for i in range(1, min(int(msg.chancount or 8), 16) + 1):
            chans.append(int(getattr(msg, f"chan{i}_raw", 0)))
        telemetry["rc_channels"] = [c for c in chans if c > 800]
        if msg.rssi != 255:
            telemetry["rc_rssi"] = round(msg.rssi / 254.0 * 100.0, 1)

    elif mtype in ("RADIO", "RADIO_STATUS"):
        rssi = getattr(msg, "rssi", None)
        rem = getattr(msg, "remrssi", None)
        if rssi is not None:
            telemetry["rssi"] = int(rssi) if rssi <= 100 else round(rssi / 2.55, 1)
        if rem is not None:
            telemetry["remote_rssi"] = int(rem) if rem <= 100 else round(rem / 2.55, 1)
        telemetry["noise"] = getattr(msg, "noise", telemetry["noise"])
        telemetry["txbuf"] = getattr(msg, "txbuf", telemetry["txbuf"])

    elif mtype == "SCALED_PRESSURE":
        telemetry["pressure"] = float(msg.press_abs)
        telemetry["baro_temp"] = msg.temperature / 100.0

    elif mtype == "SERVO_OUTPUT_RAW":
        servos = []
        for i in range(1, 9):
            val = int(getattr(msg, f"servo{i}_raw", 0))
            if val:
                servos.append(val)
        telemetry["servos"] = servos

    elif mtype == "MISSION_CURRENT":
        telemetry["mission_seq"] = int(msg.seq)
        telemetry["mission_total"] = int(getattr(msg, "total", 0) or 0)

    elif mtype == "EXTENDED_SYS_STATE":
        telemetry["landed_state"] = LANDED_NAME.get(msg.landed_state, str(msg.landed_state))

    elif mtype == "ESTIMATOR_STATUS":
        telemetry["ekf_flags"] = int(msg.flags)
        telemetry["estimator_ok"] = bool(msg.flags & 0x01)
        telemetry["pos_horiz_acc"] = float(msg.pos_horiz_accuracy)
        telemetry["pos_vert_acc"] = float(msg.pos_vert_accuracy)

    elif mtype == "AUTOPILOT_VERSION":
        v = msg.flight_sw_version
        telemetry["firmware"] = f"{(v >> 24) & 0xFF}.{(v >> 16) & 0xFF}.{(v >> 8) & 0xFF}"
        add_log("ok", f"Firmware {telemetry['firmware']}")

    elif mtype == "STATUSTEXT":
        text = msg.text.decode("utf-8", "ignore") if isinstance(msg.text, bytes) else str(msg.text)
        text = text.strip("\x00").strip()
        if text:
            add_log("warn" if msg.severity <= 4 else "info", f"FC: {text}")

    elif mtype == "COMMAND_ACK":
        name = mavutil.mavlink.enums["MAV_CMD"].get(msg.command)
        cmd = name.name if name else str(msg.command)
        result = mavutil.mavlink.enums["MAV_RESULT"].get(msg.result)
        res = result.name if result else str(msg.result)
        level = "ok" if msg.result == 0 else "warn"
        add_log(level, f"ACK {cmd} -> {res}")


def drain_commands(mav) -> None:
    while command_queue:
        try:
            spec = command_queue.popleft()
        except IndexError:
            return
        run_command(mav, spec)


def run_command(mav, spec: dict[str, Any]) -> None:
    cmd = (spec.get("cmd") or "").strip().lower()
    sysid = mav.target_system or 1
    compid = mav.target_component or 1
    add_log("info", f"> {cmd} {spec.get('mode') or spec.get('text') or ''}".strip())
    try:
        if cmd in ("streams", "refresh"):
            request_streams(mav)
            add_log("ok", "Streams MAVLink pedidos")
        elif cmd == "version":
            request_version(mav)
        elif cmd == "arm":
            mav.mav.command_long_send(
                sysid, compid, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0
            )
        elif cmd == "disarm":
            mav.mav.command_long_send(
                sysid, compid, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0
            )
        elif cmd in PX4_SET_MODE or cmd == "mode":
            key = (spec.get("mode") or cmd).upper()
            if key not in PX4_SET_MODE:
                add_log("err", f"Modo desconocido: {key}")
                return
            main, sub = PX4_SET_MODE[key]
            custom = (main << 16) | (sub << 24)
            mav.mav.command_long_send(
                sysid,
                compid,
                mavutil.mavlink.MAV_CMD_DO_SET_MODE,
                0,
                mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
                main,
                sub,
                0,
                0,
                0,
                0,
            )
            add_log("info", f"Set mode {key} (custom={custom})")
        elif cmd in ("rtl", "land", "loiter", "posctl", "manual", "stabilized", "altctl", "mission"):
            run_command(mav, {"cmd": "mode", "mode": cmd.upper() if cmd != "posctl" else "POSCTL"})
        else:
            add_log("err", f"Comando no soportado: {cmd}. Usa: arm disarm rtl land loiter posctl streams version")
    except Exception as exc:
        add_log("err", f"Fallo enviando {cmd}: {exc}")


def reader() -> None:
    mav = connect_mavlink()
    last_msg = time.time()
    last_broadcast = 0.0
    while True:
        try:
            drain_commands(mav)
            msg = mav.recv_match(blocking=True, timeout=0.2)
            if msg is None:
                if time.time() - last_msg > LINK_TIMEOUT_S:
                    add_log("err", "Telemetría perdida. Reconectando...")
                    telemetry["connection"] = "disconnected"
                    telemetry["armed"] = False
                    telemetry["timestamp"] = now_ms()
                    if loop is not None:
                        payload = telemetry_snapshot()["payload"]
                        loop.call_soon_threadsafe(
                            asyncio.create_task,
                            broadcast({"type": "update", "payload": payload}),
                        )
                    try:
                        mav.close()
                    except Exception:
                        pass
                    mav = connect_mavlink()
                    last_msg = time.time()
                continue
            if msg.get_type() == "BAD_DATA":
                continue
            last_msg = time.time()
            ingest(msg)
            now = time.time()
            if now - last_broadcast >= 1.0 / BROADCAST_HZ and loop is not None:
                last_broadcast = now
                payload = {k: v for k, v in telemetry.items() if k != "logs"}
                payload["logs"] = list(logs)[-40:]
                loop.call_soon_threadsafe(
                    asyncio.create_task, broadcast({"type": "update", "payload": payload})
                )
        except Exception as exc:
            add_log("err", f"Error MAVLink: {exc}")
            telemetry["connection"] = "disconnected"
            telemetry["armed"] = False
            telemetry["timestamp"] = now_ms()
            if loop is not None:
                payload = telemetry_snapshot()["payload"]
                loop.call_soon_threadsafe(
                    asyncio.create_task,
                    broadcast({"type": "update", "payload": payload}),
                )
            time.sleep(2)
            try:
                mav.close()
            except Exception:
                pass
            mav = connect_mavlink()


async def broadcast(message: dict[str, Any]) -> None:
    if not clients:
        return
    raw = dumps(message)
    stale = []
    for client in list(clients):
        try:
            await client.send(raw)
        except Exception:
            stale.append(client)
    for client in stale:
        clients.discard(client)


async def ws_handler(websocket) -> None:
    clients.add(websocket)
    add_log("info", f"Dashboard conectado ({len(clients)})")
    snap = {k: v for k, v in telemetry.items() if k != "logs"}
    snap["logs"] = list(logs)[-80:]
    try:
        await websocket.send(dumps({"type": "snapshot", "payload": snap}))
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") == "command":
                command_queue.append(msg)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        clients.discard(websocket)


def telemetry_snapshot() -> dict[str, Any]:
    snap = {k: v for k, v in telemetry.items() if k != "logs"}
    snap["logs"] = list(logs)[-80:]
    return {"type": "snapshot", "payload": snap}


class TelemetryHttpHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args) -> None:
        return

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path not in {"/", "/telemetry", "/status", "/api/telemetry"}:
            self.send_error(404)
            return
        body = dumps(telemetry_snapshot()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_http_server() -> None:
    httpd = ThreadingHTTPServer(("0.0.0.0", HTTP_PORT), TelemetryHttpHandler)
    threading.Thread(target=httpd.serve_forever, name="telemetry-http", daemon=True).start()
    add_log("ok", f"HTTP telemetría en http://127.0.0.1:{HTTP_PORT}/telemetry")


def ws_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex(("127.0.0.1", port)) == 0


async def main() -> None:
    global loop
    loop = asyncio.get_running_loop()
    start_http_server()
    threading.Thread(target=reader, name="mavlink", daemon=True).start()
    async with websockets.serve(ws_handler, "0.0.0.0", WS_PORT):
        add_log("ok", f"WebSocket listo en ws://127.0.0.1:{WS_PORT}")
        await asyncio.Future()


if __name__ == "__main__":
    print(Style.BRIGHT + Fore.MAGENTA + "DronCRoD · puente SiK / MAVLink")
    if ws_port_in_use(WS_PORT):
        print(Fore.YELLOW + f"Ya hay un puente en ws://127.0.0.1:{WS_PORT}")
        print(Fore.YELLOW + "No lances otro python. Recarga http://localhost:3000")
        print(Fore.YELLOW + "Si quieres reiniciar: cierra esa ventana de Python primero.")
        sys.exit(1)
    try:
        asyncio.run(main())
    except OSError as exc:
        if getattr(exc, "winerror", None) == 10048 or getattr(exc, "errno", None) in (10048, 98):
            print(Fore.YELLOW + f"El puerto {WS_PORT} ya esta en uso. Recarga el dashboard; no abras otro puente.")
            sys.exit(1)
        raise
