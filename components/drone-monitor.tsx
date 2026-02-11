"use client"

import { Card } from "@/components/ui/card"
import { Battery, Wifi, Satellite, Gauge, MapPin, Clock } from "lucide-react"
import { useTelemetry } from "./useTelemetry"

export function DroneMonitorReplica() {
  // 🔹 Obtener datos de telemetría
  const stats = useTelemetry()

  // 🔹 Funciones auxiliares (mismo comportamiento que en el original)
  const getBatteryColor = (battery: number) => {
    if (battery > 50) return "text-chart-3"
    if (battery > 20) return "text-chart-4"
    return "text-destructive"
  }

  const getConnectionColor = (connection: string) => {
    if (connection === "connected") return "text-chart-3"
    if (connection === "weak") return "text-chart-4"
    return "text-destructive"
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // 🔹 Renderizado (idéntico al original, solo cambia el título)
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground">
            Monitor de Dron — Réplica
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Estadísticas en tiempo real (vista alternativa)</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`h-3 w-3 rounded-full ${
              stats.connection === "connected" ? "bg-chart-3" : "bg-destructive"
            } animate-pulse`}
          />
          <span className="font-mono text-sm text-muted-foreground">
            {stats.connection === "connected" ? "Conectado" : "Desconectado"}
          </span>
        </div>
      </div>

      {/* ---- Tarjetas principales ---- */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Batería</p>
              <p className={`font-mono text-3xl font-bold ${getBatteryColor(stats.battery)}`}>
                {stats.battery.toFixed(2)}%
              </p>
            </div>
            <Battery className={`h-8 w-8 ${getBatteryColor(stats.battery)}`} />
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Conexión</p>
              <p className={`font-mono text-3xl font-bold ${getConnectionColor(stats.connection)}`}>
                {stats.connection === "connected" ? "OK" : "ERROR"}
              </p>
            </div>
            <Wifi className={`h-8 w-8 ${getConnectionColor(stats.connection)}`} />
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Satélites</p>
              <p className="font-mono text-3xl font-bold text-primary">{stats.satellites}</p>
            </div>
            <Satellite className="h-8 w-8 text-primary" />
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Tiempo de Vuelo</p>
              <p className="font-mono text-3xl font-bold text-accent">
                
              </p>
            </div>
            <Clock className="h-8 w-8 text-accent" />
          </div>
        </Card>
      </div>

      {/* ---- Datos de vuelo ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card p-6">
          <h2 className="mb-4 font-mono text-lg font-semibold text-foreground">Datos de Vuelo</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Altitud</span>
              </div>
              <span className="font-mono text-lg font-semibold text-foreground">
                {stats.altitude.toFixed(2)} m
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Velocidad</span>
              </div>
              <span className="font-mono text-lg font-semibold text-foreground">
                {stats.speed.toFixed(2)} m/s
              </span>
            </div>
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          <h2 className="mb-4 font-mono text-lg font-semibold text-foreground">Posición GPS</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Latitud</span>
              </div>
              <span className="font-mono text-lg font-semibold text-foreground">
                {stats.latitude.toFixed(6)}°
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Longitud</span>
              </div>
              <span className="font-mono text-lg font-semibold text-foreground">
                {stats.longitude.toFixed(6)}°
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
