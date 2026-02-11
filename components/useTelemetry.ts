"use client"

import { useEffect, useState } from "react"

interface TelemetryData {
  battery: number
  satellites: number
  altitude: number
  speed: number
  latitude: number
  longitude: number
  connection: "connected" | "disconnected"
  timestamp?: number
}

export function useTelemetry(wsUrl = "ws://localhost:8766") {
  const [data, setData] = useState<TelemetryData>({
    battery: 0,
    satellites: 0,
    altitude: 0,
    speed: 0,
    latitude: 0,
    longitude: 0,
    connection: "disconnected",
  })

  useEffect(() => {
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => console.log("📡 Conectado al servidor de telemetría")
    ws.onclose = () => {
      console.log("❌ Desconectado del servidor de telemetría")
      setData(prev => ({ ...prev, connection: "disconnected" }))
    }

    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === "snapshot" || msg.type === "update") {
          setData(msg.payload)
        }
      } catch (err) {
        console.error("Error procesando telemetría:", err)
      }
    }

    return () => ws.close()
  }, [wsUrl])

  return data
}
