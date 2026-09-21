"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export type TelemetryLog = {
  t: number
  level: "info" | "ok" | "warn" | "err" | string
  text: string
}

export type TelemetryData = {
  connection: "connected" | "disconnected"
  timestamp: number | null
  port: string | null
  sysid: number
  compid: number
  vehicle_type: string
  autopilot: string
  mavlink_version: number
  firmware: string
  flight_mode: string
  armed: boolean
  system_status: string
  landed_state: string
  battery: number
  voltage: number
  current: number
  battery_temp: number | null
  cpu_load: number
  satellites: number
  gps_fix: number
  gps_fix_name: string
  hdop: number
  vdop: number
  gps_speed: number
  cog: number
  latitude: number
  longitude: number
  altitude: number
  alt_relative: number
  alt_amsl: number
  speed: number
  airspeed: number
  climb: number
  heading: number
  throttle: number
  roll: number
  pitch: number
  yaw: number
  vx: number
  vy: number
  vz: number
  rssi: number | null
  remote_rssi: number | null
  rc_rssi: number | null
  noise: number | null
  txbuf: number | null
  drop_rate: number
  errors_comm: number
  uptime_s: number
  mission_seq: number
  mission_total: number
  pressure: number
  baro_temp: number | null
  estimator_ok: boolean
  ekf_flags: number
  pos_horiz_acc: number
  pos_vert_acc: number
  rc_channels: number[]
  servos: number[]
  logs: TelemetryLog[]
}

const EMPTY: TelemetryData = {
  connection: "disconnected",
  timestamp: null,
  port: null,
  sysid: 0,
  compid: 0,
  vehicle_type: "",
  autopilot: "",
  mavlink_version: 0,
  firmware: "",
  flight_mode: "—",
  armed: false,
  system_status: "—",
  landed_state: "—",
  battery: 0,
  voltage: 0,
  current: 0,
  battery_temp: null,
  cpu_load: 0,
  satellites: 0,
  gps_fix: 0,
  gps_fix_name: "NO_GPS",
  hdop: 0,
  vdop: 0,
  gps_speed: 0,
  cog: 0,
  latitude: 0,
  longitude: 0,
  altitude: 0,
  alt_relative: 0,
  alt_amsl: 0,
  speed: 0,
  airspeed: 0,
  climb: 0,
  heading: 0,
  throttle: 0,
  roll: 0,
  pitch: 0,
  yaw: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  rssi: null,
  remote_rssi: null,
  rc_rssi: null,
  noise: null,
  txbuf: null,
  drop_rate: 0,
  errors_comm: 0,
  uptime_s: 0,
  mission_seq: 0,
  mission_total: 0,
  pressure: 0,
  baro_temp: null,
  estimator_ok: false,
  ekf_flags: 0,
  pos_horiz_acc: 0,
  pos_vert_acc: 0,
  rc_channels: [],
  servos: [],
  logs: [],
}

export function hasGpsFix(data: TelemetryData) {
  return data.gps_fix >= 2 && Math.abs(data.latitude) > 0.001
}

export function useTelemetry() {
  const [data, setData] = useState<TelemetryData>(EMPTY)
  const [wsState, setWsState] = useState<"off" | "connecting" | "open">("off")
  const wsRef = useRef<WebSocket | null>(null)

  const mergePayload = useCallback((payload: Partial<TelemetryData>) => {
    setData((prev) => {
      let mergedLogs = prev.logs
      if (Array.isArray(payload.logs) && payload.logs.length) {
        const seen = new Set(prev.logs.map((l) => `${l.t}|${l.text}`))
        const extra = payload.logs.filter((l) => !seen.has(`${l.t}|${l.text}`))
        mergedLogs = [...prev.logs, ...extra].slice(-200)
      }
      if (payload.connection === "disconnected") {
        return { ...EMPTY, logs: mergedLogs }
      }
      const next = { ...prev, ...payload }
      next.logs = mergedLogs
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    let retry: number | null = null
    let poll: number | null = null
    const host = window.location.hostname || "127.0.0.1"
    const queryWsUrl = new URLSearchParams(window.location.search).get("telemetry_ws")?.trim()
    if (queryWsUrl?.startsWith("wss://")) {
      localStorage.setItem("droncrod-telemetry-ws", queryWsUrl)
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`)
    }
    const savedWsUrl = localStorage.getItem("droncrod-telemetry-ws")?.trim()
    const configuredWsUrl = queryWsUrl || process.env.NEXT_PUBLIC_TELEMETRY_WS_URL?.trim() || savedWsUrl
    const isSecurePage = window.location.protocol === "https:"
    const wsUrl =
      configuredWsUrl && (!isSecurePage || configuredWsUrl.startsWith("wss://"))
        ? configuredWsUrl
        : isSecurePage
          ? null
          : `ws://${host}:8766`
    const canReachLocalBridge = !isSecurePage

    const pullHttp = async () => {
      try {
        const res = await fetch("/api/telemetry", { cache: "no-store" })
        if (!res.ok) return
        const msg = await res.json()
        const payload = msg.payload || msg
        if (!payload || typeof payload !== "object") return
        mergePayload(payload)
      } catch {
        /* bridge still starting */
      }
    }

    const connect = () => {
      if (cancelled || !wsUrl) {
        setWsState("off")
        return
      }
      setWsState("connecting")
      let ws: WebSocket
      try {
        ws = new WebSocket(wsUrl)
      } catch {
        setWsState("off")
        setData((prev) => ({ ...EMPTY, logs: prev.logs }))
        return
      }
      wsRef.current = ws
      ws.onopen = () => {
        if (cancelled) return
        setWsState("open")
      }
      ws.onclose = () => {
        if (cancelled) return
        setWsState("off")
        setData((prev) => ({ ...EMPTY, logs: prev.logs }))
        retry = window.setTimeout(connect, 1500)
      }
      ws.onerror = () => {
        /* onclose handles retry; do not abort a handshake */
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === "snapshot" || msg.type === "update") {
            mergePayload(msg.payload)
          } else if (msg.type === "log" && msg.payload) {
            setData((prev) => ({
              ...prev,
              logs: [...prev.logs, msg.payload].slice(-200),
            }))
          }
        } catch {
          /* ignore malformed frames */
        }
      }
    }

    connect()
    if (canReachLocalBridge) {
      void pullHttp()
      poll = window.setInterval(pullHttp, 400)
    }
    const freshness = window.setInterval(() => {
      setData((prev) => {
        if (
          prev.connection !== "connected" ||
          !prev.timestamp ||
          Date.now() / 1000 - prev.timestamp <= 2.5
        ) {
          return prev
        }
        return { ...EMPTY, logs: prev.logs }
      })
    }, 250)
    return () => {
      cancelled = true
      if (retry) window.clearTimeout(retry)
      if (poll) window.clearInterval(poll)
      window.clearInterval(freshness)
      const ws = wsRef.current
      wsRef.current = null
      if (ws && ws.readyState < 2) ws.close()
    }
  }, [mergePayload])

  const sendCommand = useCallback((cmd: string, extra: Record<string, string> = {}) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: "command", cmd, ...extra }))
    return true
  }, [])

  return { data, wsState, sendCommand }
}

export type TelemetryState = ReturnType<typeof useTelemetry>
