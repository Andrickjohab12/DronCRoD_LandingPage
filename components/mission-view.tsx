"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { MapPin, Navigation, Gauge, Activity, Wifi, WifiOff } from "lucide-react"
import { useTelemetry } from "./useTelemetry"

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface PositionPoint {
  lat: number
  lng: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const HOME_LAT = 32.5464977
const HOME_LNG = -116.9009348
const MAX_TRAIL  = 120   // puntos máximos de trayectoria
const MAX_GRAPH  = 60    // muestras en la gráfica

// ─── Mapa con Canvas (sin dependencia externa adicional) ──────────────────────
function DroneMap({ lat, lng, heading, trail }: {
  lat: number; lng: number; heading: number; trail: PositionPoint[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Convierte lat/lng a píxeles relativo al centro
  const project = (
    pLat: number, pLng: number,
    cLat: number, cLng: number,
    scale: number, w: number, h: number
  ) => {
    const x = (pLng - cLng) * scale + w / 2
    const y = -(pLat - cLat) * scale + h / 2
    return { x, y }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const scale = 80000  // píxeles por grado

    // Fondo tipo mapa (azul agua)
    ctx.fillStyle = "#e8f4fd"
    ctx.fillRect(0, 0, w, h)

    // Grid de referencia
    ctx.strokeStyle = "#bfdbfe"
    ctx.lineWidth = 0.5
    for (let i = 0; i < w; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke()
    }
    for (let j = 0; j < h; j += 40) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke()
    }

    // Centro del mapa = posición actual del dron
    const cLat = lat || HOME_LAT
    const cLng = lng || HOME_LNG

    // Trayectoria
    if (trail.length > 1) {
      ctx.beginPath()
      ctx.strokeStyle = "#3b82f6"
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      const p0 = project(trail[0].lat, trail[0].lng, cLat, cLng, scale, w, h)
      ctx.moveTo(p0.x, p0.y)
      trail.forEach(pt => {
        const p = project(pt.lat, pt.lng, cLat, cLng, scale, w, h)
        ctx.lineTo(p.x, p.y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Punto HOME
    const home = project(HOME_LAT, HOME_LNG, cLat, cLng, scale, w, h)
    ctx.beginPath()
    ctx.arc(home.x, home.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = "#1d4ed8"
    ctx.fill()
    ctx.fillStyle = "#fff"
    ctx.font = "bold 8px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("H", home.x, home.y)

    // Icono del dron (centro del mapa)
    const cx = w / 2
    const cy = h / 2
    const rad = (heading - 90) * Math.PI / 180

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rad)

    // Sombra
    ctx.shadowColor = "#2563eb"
    ctx.shadowBlur = 12

    // Cuerpo del dron
    ctx.beginPath()
    ctx.moveTo(0, -14)   // nariz
    ctx.lineTo(8, 10)
    ctx.lineTo(0, 6)
    ctx.lineTo(-8, 10)
    ctx.closePath()
    ctx.fillStyle = "#1d4ed8"
    ctx.fill()
    ctx.strokeStyle = "#fff"
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.shadowBlur = 0
    ctx.restore()

    // Círculo de posición
    ctx.beginPath()
    ctx.arc(cx, cy, 20, 0, Math.PI * 2)
    ctx.strokeStyle = "#3b82f680"
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Coordenadas en el mapa
    ctx.fillStyle = "#1e40af"
    ctx.font = "11px monospace"
    ctx.textAlign = "left"
    ctx.textBaseline = "bottom"
    ctx.fillText(`${cLat.toFixed(6)}° N`, 8, h - 24)
    ctx.fillText(`${cLng.toFixed(6)}° W`, 8, h - 8)

    // Escala visual
    ctx.fillStyle = "#1e40af"
    ctx.fillRect(w - 90, h - 16, 80, 3)
    ctx.font = "10px monospace"
    ctx.textAlign = "center"
    ctx.fillText("~100 m", w - 50, h - 20)

  }, [lat, lng, heading, trail])

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={400}
      className="h-full w-full rounded-xl"
      style={{ imageRendering: "pixelated" }}
    />
  )
}

// ─── Horizonte Artificial ─────────────────────────────────────────────────────
function ArtificialHorizon({ pitch = 0, roll = 0 }: { pitch: number; roll: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) / 2 - 4

    ctx.clearRect(0, 0, w, h)

    // Clip circular
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.clip()

    // Rotación por roll
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((roll * Math.PI) / 180)

    // Desplazamiento por pitch (1° = 2px)
    const pitchOffset = pitch * 2

    // Cielo
    ctx.fillStyle = "#1d4ed8"
    ctx.fillRect(-w, -h - pitchOffset, w * 2, h)

    // Tierra
    ctx.fillStyle = "#92400e"
    ctx.fillRect(-w, -pitchOffset, w * 2, h)

    // Línea horizonte
    ctx.strokeStyle = "#fbbf24"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-w, -pitchOffset)
    ctx.lineTo(w, -pitchOffset)
    ctx.stroke()

    // Líneas de pitch
    for (let p = -30; p <= 30; p += 10) {
      if (p === 0) continue
      const y = -pitchOffset - p * 2
      const len = p % 20 === 0 ? 30 : 18
      ctx.strokeStyle = "#ffffffcc"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-len, y)
      ctx.lineTo(len, y)
      ctx.stroke()
      ctx.fillStyle = "#ffffffcc"
      ctx.font = "8px monospace"
      ctx.textAlign = "right"
      ctx.fillText(`${p}`, -len - 3, y + 3)
    }

    ctx.restore()
    ctx.restore()

    // Marco circular
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = "#1e40af"
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.restore()

    // Línea de referencia del avión (fija)
    ctx.strokeStyle = "#fbbf24"
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.5, cy)
    ctx.lineTo(cx - 10, cy)
    ctx.moveTo(cx + 10, cy)
    ctx.lineTo(cx + r * 0.5, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fillStyle = "#fbbf24"
    ctx.fill()

    // Indicador de roll en arco
    ctx.strokeStyle = "#60a5fa"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, r - 8, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180)
    ctx.stroke()
    for (const angle of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) {
      const a = ((-90 + angle) * Math.PI) / 180
      const inner = r - 14
      const outer = r - 8
      ctx.beginPath()
      ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a))
      ctx.lineTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a))
      ctx.strokeStyle = angle === 0 ? "#fbbf24" : "#60a5fa"
      ctx.lineWidth = angle === 0 ? 2 : 1
      ctx.stroke()
    }

    // Puntero de roll
    const rollRad = ((-90 + roll) * Math.PI) / 180
    const tipR = r - 6
    ctx.beginPath()
    ctx.moveTo(cx + tipR * Math.cos(rollRad), cy + tipR * Math.sin(rollRad))
    ctx.lineTo(
      cx + (tipR - 8) * Math.cos(rollRad - 0.12),
      cy + (tipR - 8) * Math.sin(rollRad - 0.12)
    )
    ctx.lineTo(
      cx + (tipR - 8) * Math.cos(rollRad + 0.12),
      cy + (tipR - 8) * Math.sin(rollRad + 0.12)
    )
    ctx.closePath()
    ctx.fillStyle = "#fbbf24"
    ctx.fill()

  }, [pitch, roll])

  return <canvas ref={canvasRef} width={180} height={180} className="w-full h-full" />
}

// ─── Brújula ──────────────────────────────────────────────────────────────────
function Compass({ heading }: { heading: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const r = Math.min(w, h) / 2 - 6

    ctx.clearRect(0, 0, w, h)

    // Fondo
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = "#eff6ff"
    ctx.fill()
    ctx.strokeStyle = "#1e40af"
    ctx.lineWidth = 3
    ctx.stroke()

    // Marcas de grados
    for (let i = 0; i < 360; i += 5) {
      const a = ((i - heading - 90) * Math.PI) / 180
      const isMajor = i % 45 === 0
      const isMid   = i % 15 === 0
      const len = isMajor ? 14 : isMid ? 9 : 5
      const outer = r - 2
      ctx.beginPath()
      ctx.moveTo(cx + outer * Math.cos(a), cy + outer * Math.sin(a))
      ctx.lineTo(cx + (outer - len) * Math.cos(a), cy + (outer - len) * Math.sin(a))
      ctx.strokeStyle = isMajor ? "#1d4ed8" : "#93c5fd"
      ctx.lineWidth = isMajor ? 2 : 1
      ctx.stroke()
    }

    // Letras cardinales
    const cardinals = ["N", "E", "S", "W"]
    cardinals.forEach((label, i) => {
      const a = ((i * 90 - heading - 90) * Math.PI) / 180
      const tr = r - 22
      const x = cx + tr * Math.cos(a)
      const y = cy + tr * Math.sin(a)
      ctx.fillStyle = label === "N" ? "#dc2626" : "#1d4ed8"
      ctx.font = `bold ${label === "N" ? 14 : 12}px monospace`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(label, x, y)
    })

    // Aguja N (roja)
    const northA = ((-heading - 90) * Math.PI) / 180
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(northA + Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(0, -(r - 30))
    ctx.lineTo(6, 0)
    ctx.lineTo(-6, 0)
    ctx.closePath()
    ctx.fillStyle = "#dc2626"
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, r - 30)
    ctx.lineTo(6, 0)
    ctx.lineTo(-6, 0)
    ctx.closePath()
    ctx.fillStyle = "#93c5fd"
    ctx.fill()
    ctx.restore()

    // Centro
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fillStyle = "#1d4ed8"
    ctx.fill()

    // Heading numérico
    ctx.fillStyle = "#1e40af"
    ctx.font = "bold 13px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(`${Math.round(heading)}°`, cx, cy + r - 14)

  }, [heading])

  return <canvas ref={canvasRef} width={180} height={180} className="w-full h-full" />
}

// ─── Gráfica de Altitud ───────────────────────────────────────────────────────
function AltitudeGraph({ data }: { data: number[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const pad = { top: 16, right: 16, bottom: 28, left: 44 }
    const gw = w - pad.left - pad.right
    const gh = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    if (data.length < 2) {
      ctx.fillStyle = "#93c5fd"
      ctx.font = "12px monospace"
      ctx.textAlign = "center"
      ctx.fillText("Esperando datos...", w / 2, h / 2)
      return
    }

    const maxVal = Math.max(...data, 1)
    const minVal = Math.min(...data, 0)
    const range  = maxVal - minVal || 1

    const toX = (i: number) => pad.left + (i / (data.length - 1)) * gw
    const toY = (v: number) => pad.top + gh - ((v - minVal) / range) * gh

    // Fondo
    ctx.fillStyle = "#eff6ff"
    ctx.fillRect(pad.left, pad.top, gw, gh)

    // Grid horizontal
    ctx.strokeStyle = "#bfdbfe"
    ctx.lineWidth = 0.5
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * gh
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + gw, y); ctx.stroke()
      const val = maxVal - (i / 4) * range
      ctx.fillStyle = "#1e40af"
      ctx.font = "10px monospace"
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText(`${val.toFixed(0)}m`, pad.left - 4, y)
    }

    // Área bajo la curva
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + gh)
    grad.addColorStop(0, "#3b82f660")
    grad.addColorStop(1, "#3b82f605")
    ctx.beginPath()
    ctx.moveTo(toX(0), toY(data[0]))
    data.forEach((v, i) => ctx.lineTo(toX(i), toY(v)))
    ctx.lineTo(toX(data.length - 1), pad.top + gh)
    ctx.lineTo(toX(0), pad.top + gh)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()

    // Línea
    ctx.beginPath()
    ctx.strokeStyle = "#2563eb"
    ctx.lineWidth = 2
    ctx.lineJoin = "round"
    data.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)))
    ctx.stroke()

    // Punto actual
    const last = data[data.length - 1]
    ctx.beginPath()
    ctx.arc(toX(data.length - 1), toY(last), 4, 0, Math.PI * 2)
    ctx.fillStyle = "#1d4ed8"
    ctx.fill()
    ctx.strokeStyle = "#fff"
    ctx.lineWidth = 1.5
    ctx.stroke()

    // Etiqueta valor actual
    ctx.fillStyle = "#1d4ed8"
    ctx.font = "bold 11px monospace"
    ctx.textAlign = "right"
    ctx.textBaseline = "bottom"
    ctx.fillText(`${last.toFixed(1)}m`, toX(data.length - 1) - 6, toY(last) - 2)

    // Eje X (tiempo)
    ctx.fillStyle = "#1e40af"
    ctx.font = "10px monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText("0s", pad.left, pad.top + gh + 4)
    ctx.fillText(`${MAX_GRAPH}s`, pad.left + gw, pad.top + gh + 4)
    ctx.fillText("Tiempo", pad.left + gw / 2, pad.top + gh + 4)

  }, [data])

  return <canvas ref={canvasRef} width={500} height={160} className="w-full h-full" />
}

// ─── Vista principal ──────────────────────────────────────────────────────────
export function MissionView() {
  const { data: stats } = useTelemetry()

  const [trail, setTrail]       = useState<PositionPoint[]>([])
  const [altHistory, setAltHistory] = useState<number[]>([])

  // Acumular trayectoria y gráfica
  useEffect(() => {
    if (stats.latitude === 0 && stats.longitude === 0) return

    setTrail(prev => {
      const next = [...prev, { lat: stats.latitude, lng: stats.longitude }]
      return next.length > MAX_TRAIL ? next.slice(-MAX_TRAIL) : next
    })

    setAltHistory(prev => {
      const next = [...prev, stats.altitude]
      return next.length > MAX_GRAPH ? next.slice(-MAX_GRAPH) : next
    })
  }, [stats.latitude, stats.longitude, stats.altitude])

  const isConnected = stats.connection === "connected"

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:space-y-6 md:p-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-50 via-blue-100/50 to-white p-4 shadow-lg md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h2 className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            Vista de Misión
          </h2>
          <p className="mt-2 text-sm text-blue-600/70">Mapa en vivo · Indicadores de vuelo · Telemetría</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-2 shadow-md md:px-6 md:py-3">
          <div className={`h-4 w-4 rounded-full animate-pulse ${isConnected ? "bg-blue-500 shadow-lg shadow-blue-500/50" : "bg-gray-400"}`} />
          <span className="font-mono text-base font-bold text-blue-700 md:text-lg">
            {isConnected ? "CONECTADO" : "DESCONECTADO"}
          </span>
          {isConnected
            ? <Wifi className="h-5 w-5 text-blue-500" />
            : <WifiOff className="h-5 w-5 text-gray-400" />}
        </div>
      </div>

      {/* ── Mapa + Instrumentos ──────────────────────────────────────────────── */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">

        {/* Mapa — ocupa 2 columnas */}
        <Card className="border-0 bg-white p-4 shadow-xl lg:col-span-2 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <MapPin className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Posición en Tiempo Real</h3>
            <span className="ml-auto font-mono text-xs text-blue-500">
              {trail.length} puntos registrados
            </span>
          </div>
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-blue-100">
            <DroneMap
              lat={stats.latitude}
              lng={stats.longitude}
              heading={stats.heading}
              trail={trail}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[
              { label: "Latitud",  value: `${stats.latitude.toFixed(6)}°` },
              { label: "Longitud", value: `${stats.longitude.toFixed(6)}°` },
              { label: "Rumbo",    value: `${stats.heading.toFixed(0)}°` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3">
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <span className="font-mono text-sm font-bold text-blue-600">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Instrumentos — columna derecha */}
        <div className="space-y-4">

          {/* Horizonte artificial */}
          <Card className="border-0 bg-white p-4 shadow-xl md:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-2.5">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Horizonte Artificial</h3>
            </div>
            <div className="mx-auto aspect-square w-44">
              <ArtificialHorizon pitch={0} roll={0} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-2 text-center">
                <p className="text-[10px] font-semibold text-foreground">Pitch</p>
                <p className="font-mono text-sm font-bold text-blue-600">0°</p>
              </div>
              <div className="rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-2 text-center">
                <p className="text-[10px] font-semibold text-foreground">Roll</p>
                <p className="font-mono text-sm font-bold text-blue-600">0°</p>
              </div>
            </div>
          </Card>

          {/* Brújula */}
          <Card className="border-0 bg-white p-4 shadow-xl md:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="rounded-xl bg-blue-100 p-2.5">
                <Navigation className="h-5 w-5 text-blue-600" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Brújula</h3>
              <span className="ml-auto font-mono text-lg font-bold text-blue-600">
                {stats.heading.toFixed(0)}°
              </span>
            </div>
            <div className="mx-auto aspect-square w-44">
              <Compass heading={stats.heading} />
            </div>
          </Card>
        </div>
      </div>

      {/* ── Gráfica de altitud + Stats ─────────────────────────────────────── */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">

        {/* Gráfica — 2 columnas */}
        <Card className="border-0 bg-white p-4 shadow-xl lg:col-span-2 md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Gauge className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Gráfica de Altitud</h3>
            <span className="ml-auto font-mono text-xl font-bold text-blue-600">
              {stats.altitude.toFixed(1)} m
            </span>
          </div>
          <div className="h-40 w-full">
            <AltitudeGraph data={altHistory} />
          </div>
        </Card>

        {/* Stats rápidos */}
        <Card className="border-0 bg-white p-4 shadow-xl md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Parámetros</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Altitud",    value: `${stats.altitude.toFixed(2)} m` },
              { label: "Velocidad",  value: `${stats.speed.toFixed(2)} m/s` },
              { label: "Satélites",  value: `${stats.satellites}` },
              { label: "Batería",    value: `${stats.battery.toFixed(0)}%` },
              { label: "Modo",       value: stats.flight_mode },
              { label: "Trayectoria", value: `${trail.length} pts` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="font-mono text-sm font-bold text-blue-600">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

    </div>
  )
}