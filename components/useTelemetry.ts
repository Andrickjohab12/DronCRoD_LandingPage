"use client"

import { useEffect, useState, useCallback } from "react"

export interface TelemetryData {
  battery: number
  voltage: number       // voltaje exacto en V
  current: number       // corriente en A
  satellites: number
  altitude: number
  speed: number
  heading: number       // rumbo magnético en grados
  latitude: number
  longitude: number
  connection: "connected" | "disconnected"
  armed: boolean        // estado de armado
  flight_mode: string   // modo de vuelo actual
  timestamp?: number
}

export interface CommandAck {
  command: string
  success: boolean
  message: string
}

export function useTelemetry(wsUrl = "ws://localhost:8766") {
  const [data, setData] = useState<TelemetryData>({
    battery: 0,
    voltage: 0,
    current: 0,
    satellites: 0,
    altitude: 0,
    speed: 0,
    heading: 0,
    latitude: 0,
    longitude: 0,
    connection: "disconnected",
    armed: false,
    flight_mode: "UNKNOWN",
  })

  const [lastAck, setLastAck] = useState<CommandAck | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  useEffect(() => {
    const socket = new WebSocket(wsUrl)

    socket.onopen = () => {
      console.log("📡 Conectado al servidor de telemetría")
      setWs(socket)
    }

    socket.onclose = () => {
      console.log("❌ Desconectado del servidor de telemetría")
      setData(prev => ({ ...prev, connection: "disconnected" }))
      setWs(null)
    }

    socket.onmessage = event => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === "snapshot" || msg.type === "update") {
          setData(msg.payload)
        } else if (msg.type === "command_ack") {
          setLastAck({ command: msg.command, success: msg.success, message: msg.message })
        }
      } catch (err) {
        console.error("Error procesando mensaje:", err)
      }
    }

    return () => socket.close()
  }, [wsUrl])

  // Función para enviar comandos al bridge
  const sendCommand = useCallback(
    (command: string, args: Record<string, unknown> = {}) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket no disponible")
        return false
      }
      ws.send(JSON.stringify({ command, args }))
      return true
    },
    [ws]
  )

  return { data, lastAck, sendCommand }
}