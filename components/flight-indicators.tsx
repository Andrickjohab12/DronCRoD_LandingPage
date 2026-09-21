"use client"

import { Battery, Gauge, Radio, Satellite } from "lucide-react"
import type { TelemetryData } from "./useTelemetry"

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value))
}

function Arc({
  value,
  color = "stroke-primary",
}: {
  value: number
  color?: string
}) {
  const normalized = clamp(value)
  const circumference = 2 * Math.PI * 42
  return (
    <svg viewBox="0 0 100 100" className="-rotate-90">
      <circle cx="50" cy="50" r="42" fill="none" className="stroke-border" strokeWidth="7" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        className={`${color} transition-all duration-500`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - normalized / 100)}
      />
    </svg>
  )
}

function MetricCard({
  label,
  value,
  detail,
  percent,
  icon,
  warning,
}: {
  label: string
  value: string
  detail: string
  percent: number
  icon: React.ReactNode
  warning?: boolean
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-blue-400 to-transparent" />
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <Arc value={percent} color={warning ? "stroke-red-500" : "stroke-primary"} />
          <div className={`absolute inset-0 flex items-center justify-center ${warning ? "text-red-500" : "text-primary"}`}>
            {icon}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  )
}

export function ArtificialHorizon({ roll, pitch }: { roll: number; pitch: number }) {
  return (
    <div className="relative aspect-square w-full max-w-[180px] overflow-hidden rounded-full border-4 border-card bg-slate-900 shadow-[0_0_0_1px_var(--border)]">
      <div
        className="absolute -inset-[45%] transition-transform duration-200"
        style={{ transform: `translateY(${clamp(pitch, -30, 30) * 1.25}px) rotate(${-roll}deg)` }}
      >
        <div className="h-1/2 bg-gradient-to-b from-sky-500 to-blue-600" />
        <div className="h-1/2 bg-gradient-to-b from-amber-700 to-amber-950" />
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-white/90" />
      </div>
      <div className="absolute inset-x-5 top-1/2 flex items-center">
        <span className="h-0.5 flex-1 bg-white" />
        <span className="mx-1 h-2 w-2 rotate-45 border-b-2 border-r-2 border-white" />
        <span className="h-0.5 flex-1 bg-white" />
      </div>
      <div className="absolute inset-x-0 top-3 text-center font-mono text-[9px] text-white/80">HORIZONTE</div>
      <div className="absolute inset-x-0 bottom-3 text-center font-mono text-[10px] text-white">
        R {roll.toFixed(1)}° · P {pitch.toFixed(1)}°
      </div>
    </div>
  )
}

export function HeadingDial({ heading }: { heading: number }) {
  const cardinal = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round((((heading % 360) + 360) % 360) / 45) % 8]
  return (
    <div className="relative aspect-square w-full max-w-[180px] rounded-full border border-border bg-card shadow-inner">
      <div
        className="absolute inset-4 rounded-full border border-dashed border-primary/40 transition-transform duration-300"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        <span className="absolute left-1/2 top-1 -translate-x-1/2 font-mono text-xs font-bold text-primary">N</span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-mono text-[10px] text-muted-foreground">S</span>
        <span className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">E</span>
        <span className="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">O</span>
      </div>
      <div className="absolute left-1/2 top-2 -translate-x-1/2 border-x-[5px] border-t-[9px] border-x-transparent border-t-primary" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-semibold">{Math.round(heading)}°</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">{cardinal}</span>
      </div>
    </div>
  )
}

export function FlightIndicators({ data }: { data: TelemetryData }) {
  const signal = data.rssi ?? data.remote_rssi ?? data.rc_rssi ?? 0
  const gpsPercent = clamp((data.satellites / 16) * 100)
  const altitudePercent = clamp(Math.abs(data.altitude) / 3)

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Energía"
        value={`${Math.round(data.battery)}%`}
        detail={`${data.voltage.toFixed(2)} V · ${data.current.toFixed(2)} A`}
        percent={data.battery}
        icon={<Battery className="h-5 w-5" />}
        warning={data.battery > 0 && data.battery <= 20}
      />
      <MetricCard
        label="Navegación"
        value={`${data.satellites} sats`}
        detail={`${data.gps_fix_name} · HDOP ${data.hdop.toFixed(2)}`}
        percent={gpsPercent}
        icon={<Satellite className="h-5 w-5" />}
        warning={data.gps_fix < 2}
      />
      <MetricCard
        label="Altitud"
        value={`${data.altitude.toFixed(1)} m`}
        detail={`REL ${data.alt_relative.toFixed(1)} · AMSL ${data.alt_amsl.toFixed(1)}`}
        percent={altitudePercent}
        icon={<Gauge className="h-5 w-5" />}
      />
      <MetricCard
        label="Enlace"
        value={data.connection === "connected" ? "ONLINE" : "OFFLINE"}
        detail={signal ? `RSSI ${Math.round(signal)}% · ${data.port || "SiK"}` : data.port || "Sin radio"}
        percent={data.connection === "connected" ? signal || 100 : 0}
        icon={<Radio className="h-5 w-5" />}
        warning={data.connection !== "connected"}
      />
    </div>
  )
}
