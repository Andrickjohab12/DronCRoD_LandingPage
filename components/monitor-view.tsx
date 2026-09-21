"use client"

import { Card } from "@/components/ui/card"
import { Activity, AlertTriangle, CheckCircle2, Cpu, Database, Gauge, RefreshCw, ShieldAlert, Terminal } from "lucide-react"
import { useState } from "react"
import { ArtificialHorizon, FlightIndicators, HeadingDial } from "./flight-indicators"
import { TelemetryTerminal } from "./telemetry-terminal"
import { hasGpsFix, type TelemetryState } from "./useTelemetry"
import { useWeather } from "./useweather"

function fmt(n: number, digits = 1, unit = "") {
  if (!Number.isFinite(n)) return "—"
  return `${n.toFixed(digits)}${unit ? ` ${unit}` : ""}`
}

function uptime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="group mb-1.5 flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/25 px-2.5 py-2 transition-colors last:mb-0 hover:border-primary/25 hover:bg-primary/5 sm:-mx-2 sm:mb-0 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:bg-transparent sm:px-2 sm:py-2.5 sm:last:border-0">
      <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground group-hover:text-primary">
        <span className="h-1 w-1 rounded-full bg-primary/60" />
        {label}
      </span>
      <span className="max-w-[58%] truncate rounded-md bg-primary/8 px-2 py-1 text-right font-mono text-[12px] font-semibold text-primary sm:max-w-none sm:bg-transparent sm:p-0 sm:text-[13px] sm:text-foreground">
        {value}
      </span>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="group gap-0 overflow-hidden rounded-xl border-border/80 border-l-2 border-l-primary bg-card p-0 py-0 shadow-sm transition hover:border-primary/35 hover:shadow-md">
      <div className="relative border-b border-primary/15 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent px-4 py-3.5">
        <div className="absolute bottom-0 left-0 h-px w-16 bg-primary" />
        <h3 className="text-base font-bold tracking-wide text-foreground">{title}</h3>
      </div>
      <div className="px-4 py-2.5">{children}</div>
    </Card>
  )
}

type MonitorSection = "overview" | "instruments" | "telemetry" | "systems" | "terminal"

const MONITOR_SECTIONS = [
  { id: "overview", label: "Resumen", icon: Activity },
  { id: "instruments", label: "Vuelo", icon: Gauge },
  { id: "telemetry", label: "Datos", icon: Database },
  { id: "systems", label: "Sistemas", icon: Cpu },
  { id: "terminal", label: "Terminal", icon: Terminal },
] satisfies { id: MonitorSection; label: string; icon: typeof Activity }[]

function MobilePanelSelector({
  active,
  onChange,
}: {
  active: MonitorSection
  onChange: (section: MonitorSection) => void
}) {
  return (
    <nav className="sticky top-16 z-30 -mx-3 border-y border-primary/15 bg-background/95 px-3 py-2 backdrop-blur-md lg:hidden">
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
        {MONITOR_SECTIONS.map((section) => {
          const Icon = section.icon
          const selected = active === section.id
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onChange(section.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                selected
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "border border-border bg-card text-muted-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {section.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function OperationalStatus({ telemetry }: { telemetry: TelemetryState }) {
  const data = telemetry.data
  const disconnected = data.connection !== "connected"
  const lowBattery = data.battery > 0 && data.battery <= 20
  const noGps = data.gps_fix < 2
  const ekfFailure = !data.estimator_ok
  const critical = disconnected || ekfFailure
  const warning = !critical && (lowBattery || noGps)
  const label = critical ? "Atención operativa" : warning ? "Vuelo condicionado" : "Sistema listo"
  const description = disconnected
    ? "Enlace MAVLink desconectado. Los comandos de vuelo están deshabilitados."
    : ekfFailure
      ? "El estimador EKF reporta una falla. No despegues."
      : lowBattery
        ? `Batería baja: ${Math.round(data.battery)}%. Considera aterrizar.`
        : noGps
          ? "Sin posición GPS válida. Espera un fix 3D para navegación."
          : `${data.autopilot || "Autopiloto"} · ${data.flight_mode} · telemetría estable`

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
        critical
          ? "border-red-500/30 bg-red-500/8"
          : warning
            ? "border-amber-500/30 bg-amber-500/8"
            : "border-emerald-500/30 bg-emerald-500/8"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 rounded-lg p-2 ${
            critical ? "bg-red-500/15 text-red-500" : warning ? "bg-amber-500/15 text-amber-500" : "bg-emerald-500/15 text-emerald-500"
          }`}
        >
          {critical ? <ShieldAlert className="h-4 w-4" /> : warning ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-11 font-mono text-[10px] uppercase tracking-[0.16em] sm:pl-0">
        <span className={`h-2 w-2 rounded-full ${critical ? "animate-pulse bg-red-500" : warning ? "bg-amber-500" : "bg-emerald-500"}`} />
        {data.armed ? "Aeronave armada" : "Aeronave segura"}
      </div>
    </div>
  )
}

export function MonitorView({ telemetry }: { telemetry: TelemetryState }) {
  const [mobileSection, setMobileSection] = useState<MonitorSection>("overview")
  const stats = telemetry.data
  const gpsOk = hasGpsFix(stats)
  const weather = useWeather(gpsOk ? stats.latitude : undefined, gpsOk ? stats.longitude : undefined)
  const signal = stats.rssi ?? stats.rc_rssi
  const radioOn = stats.connection === "connected"
  const linkLabel = radioOn ? "Enlace SiK" : "Desconectado"

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 px-3 py-4 sm:px-6 sm:py-6 lg:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="gcs-kicker">Telemetría</p>
          <h2 className="mt-1 text-xl font-medium tracking-tight">Consola de vuelo</h2>
          <div className="brand-rule mt-2 h-px w-32" />
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {stats.autopilot || "MAVLink"}
            {stats.firmware ? ` ${stats.firmware}` : ""}
            {stats.vehicle_type ? ` · ${stats.vehicle_type}` : ""}
            {stats.port ? ` · ${stats.port}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
          <button
            type="button"
            disabled={!radioOn}
            onClick={() => telemetry.sendCommand("streams")}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-sans text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
          <button
            type="button"
            disabled={!radioOn}
            onClick={() => telemetry.sendCommand("version")}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2 font-sans text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-40"
          >
            <Cpu className="h-3.5 w-3.5" />
            Versión FC
          </button>
          <span
            className={`rounded-lg border px-2.5 py-2 ${
              stats.armed ? "border-red-500/60 bg-red-500/10 text-red-500" : "border-border text-muted-foreground"
            }`}
          >
            {stats.armed ? "ARMADO" : "DESARMADO"}
          </span>
          <span className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-2 font-semibold text-primary">{stats.flight_mode}</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${radioOn ? "bg-emerald-400" : "bg-red-500"}`}
            />
            {linkLabel}
          </span>
        </div>
      </div>

      <MobilePanelSelector active={mobileSection} onChange={setMobileSection} />

      <section className={`${mobileSection === "overview" ? "space-y-4" : "hidden"} lg:block lg:space-y-5`}>
        <OperationalStatus telemetry={telemetry} />
        <FlightIndicators data={stats} />
      </section>

      <section className={`${mobileSection === "instruments" ? "grid" : "hidden"} gap-4 lg:grid lg:grid-cols-[1.25fr_0.75fr]`}>
        <Panel title="Instrumentación primaria">
          <div className="grid place-items-center gap-5 py-3 sm:grid-cols-2">
            <ArtificialHorizon roll={stats.roll} pitch={stats.pitch} />
            <HeadingDial heading={stats.heading} />
          </div>
        </Panel>
        <Panel title="Resumen de vuelo">
          <Row label="Modo" value={stats.flight_mode} />
          <Row label="Estado" value={stats.armed ? "ARMADO" : "DESARMADO"} />
          <Row label="En tierra" value={stats.landed_state} />
          <Row label="Tiempo FC" value={uptime(stats.uptime_s)} />
          <Row label="Batería temp." value={stats.battery_temp == null ? "—" : fmt(stats.battery_temp, 1, "°C")} />
          <Row label="Enlace" value={linkLabel} />
        </Panel>
      </section>

      <section className={`${mobileSection === "telemetry" ? "grid" : "hidden"} gap-4 lg:grid lg:grid-cols-3`}>
        <Panel title="Vuelo">
          <Row label="Groundspeed" value={fmt(stats.speed, 2, "m/s")} />
          <Row label="Airspeed" value={fmt(stats.airspeed, 2, "m/s")} />
          <Row label="Ascenso" value={fmt(stats.climb, 2, "m/s")} />
          <Row label="Throttle" value={`${stats.throttle} %`} />
          <Row label="Rumbo / COG" value={`${fmt(stats.heading, 0)}° / ${fmt(stats.cog, 0)}°`} />
        </Panel>
        <Panel title="Actitud">
          <Row label="Roll" value={fmt(stats.roll, 1, "°")} />
          <Row label="Pitch" value={fmt(stats.pitch, 1, "°")} />
          <Row label="Yaw" value={fmt(stats.yaw, 1, "°")} />
          <Row label="Vel NED" value={`${fmt(stats.vx, 1)} / ${fmt(stats.vy, 1)} / ${fmt(stats.vz, 1)}`} />
        </Panel>
        <Panel title="Posición">
          <Row label="Latitud" value={gpsOk ? fmt(stats.latitude, 6, "°") : "sin fix"} />
          <Row label="Longitud" value={gpsOk ? fmt(stats.longitude, 6, "°") : "sin fix"} />
          <Row label="Señal radio" value={signal == null ? "—" : `${fmt(signal, 0, "%")}`} />
          <Row label="RSSI remoto" value={stats.remote_rssi == null ? "—" : `${fmt(stats.remote_rssi, 0)}`} />
          <Row label="TX buffer" value={stats.txbuf == null ? "—" : String(stats.txbuf)} />
        </Panel>
      </section>

      <section className={`${mobileSection === "systems" ? "grid" : "hidden"} gap-4 lg:grid lg:grid-cols-3`}>
        <Panel title="Autopiloto">
          <Row label="Stack" value={stats.autopilot || "—"} />
          <Row label="Firmware" value={stats.firmware || "—"} />
          <Row label="MAVLink" value={stats.mavlink_version ? `v${stats.mavlink_version}` : "—"} />
          <Row label="CPU" value={fmt(stats.cpu_load, 1, "%")} />
          <Row label="EKF" value={stats.estimator_ok ? "OK" : "FALLA"} />
          <Row label="Precisión H/V" value={`${fmt(stats.pos_horiz_acc, 2)} / ${fmt(stats.pos_vert_acc, 2)} m`} />
          <Row label="WP misión" value={`${stats.mission_seq} / ${stats.mission_total || "—"}`} />
          <Row label="Errores COM" value={String(stats.errors_comm)} />
        </Panel>
        <Panel title="RC / servos">
          {stats.rc_channels.filter((ch) => ch > 800).length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Sin radio RC.</p>
          )}
          {stats.rc_channels
            .filter((ch) => ch > 800)
            .slice(0, 8)
            .map((ch, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <span className="w-9 font-mono text-[11px] text-muted-foreground">CH{i + 1}</span>
                <div className="h-px flex-1 bg-border">
                  <div
                    className="h-px bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, ((ch - 800) / 1400) * 100))}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[11px] text-foreground">{ch}</span>
              </div>
            ))}
          {stats.servos.length > 0 && (
            <p className="pt-2 font-mono text-[11px] text-muted-foreground">
              Servos {stats.servos.map((s, i) => `S${i + 1}:${s}`).join("  ")}
            </p>
          )}
        </Panel>
        <Panel title="Ambiente">
          <Row label="Baro" value={stats.baro_temp == null ? "—" : fmt(stats.baro_temp, 1, "°C")} />
          <Row label="Presión" value={stats.pressure ? fmt(stats.pressure, 1, "hPa") : "—"} />
          <Row label="Clima" value={weather?.temperature != null ? fmt(weather.temperature, 1, "°C") : "—"} />
          <Row
            label="Viento / HR"
            value={weather ? `${fmt(weather.windSpeed, 1, "m/s")} · ${fmt(weather.humidity, 0, "%")}` : "—"}
          />
          <Row label="Cielo" value={weather?.condition ?? "—"} />
        </Panel>
      </section>

      <section className={mobileSection === "terminal" ? "block" : "hidden lg:block"}>
        <Panel title="Terminal MAVLink">
          <div className="-mx-4 -mb-2">
            <TelemetryTerminal telemetry={telemetry} />
          </div>
        </Panel>
      </section>
    </div>
  )
}
