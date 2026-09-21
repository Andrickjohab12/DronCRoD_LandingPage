"use client"

import dynamic from "next/dynamic"
import { TelemetryTerminal } from "./telemetry-terminal"
import type { TelemetryState } from "./useTelemetry"

const MissionMap = dynamic(() => import("./mission-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Cargando mapa…</div>
  ),
})

export function MissionView({ telemetry }: { telemetry: TelemetryState }) {
  const t = telemetry.data
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="gcs-kicker">Navegación</p>
          <h2 className="mt-1 text-xl font-medium tracking-tight">Misión</h2>
          <div className="brand-rule mt-2 h-px w-32" />
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {t.flight_mode} · {t.gps_fix_name} · posición SiK
          </p>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {t.satellites} sats · {t.altitude.toFixed(1)} m · {t.speed.toFixed(1)} m/s · {t.heading.toFixed(0)}°
        </p>
      </div>
      <div className="overflow-hidden border border-border border-t-2 border-t-primary">
        <div className="relative aspect-video">
          <MissionMap telemetry={telemetry} />
        </div>
      </div>
      <div className="border border-border border-l-2 border-l-primary">
        <TelemetryTerminal telemetry={telemetry} />
      </div>
    </div>
  )
}
