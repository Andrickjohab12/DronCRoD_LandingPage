"use client"

import { useEffect, useState } from "react"
import { Circle, CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { hasGpsFix, type TelemetryState } from "./useTelemetry"

function FollowDrone({ lat, lon, enabled }: { lat: number; lon: number; enabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (!enabled) return
    if (Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001) return
    map.setView([lat, lon], Math.max(map.getZoom(), 16))
  }, [enabled, lat, lon, map])
  return null
}

export default function MissionMap({ telemetry }: { telemetry: TelemetryState }) {
  const drone = telemetry.data
  const gpsOk = hasGpsFix(drone)
  const [follow, setFollow] = useState(true)
  const [trail, setTrail] = useState<[number, number][]>([])
  const [home, setHome] = useState<[number, number] | null>(null)
  const lat = gpsOk ? drone.latitude : 32.5464977
  const lon = gpsOk ? drone.longitude : -116.9009348

  useEffect(() => {
    if (!gpsOk) return
    const point: [number, number] = [drone.latitude, drone.longitude]
    setHome((current) => current ?? point)
    setTrail((current) => {
      const last = current[current.length - 1]
      if (last && Math.abs(last[0] - point[0]) < 0.000002 && Math.abs(last[1] - point[1]) < 0.000002) {
        return current
      }
      return [...current.slice(-499), point]
    })
  }, [drone.latitude, drone.longitude, gpsOk])

  const droneIcon = L.divIcon({
    html: `<div style="transform: rotate(${drone.heading}deg); filter: drop-shadow(0 3px 5px rgba(0,0,0,.45));">
             <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 24 24" fill="${drone.armed ? "#ef4444" : "#2563eb"}" stroke="white" stroke-width="1.25">
               <path d="M12 2l4 8h-3v8h-2v-8h-3z"/>
             </svg>
           </div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[lat, lon]} zoom={15} scrollWheelZoom className="h-full w-full">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        />
        <FollowDrone lat={lat} lon={lon} enabled={follow && gpsOk} />
        {home && (
          <>
            <Circle center={home} radius={100} pathOptions={{ color: "#2563eb", weight: 1, opacity: 0.45, fillOpacity: 0.04 }} />
            <CircleMarker center={home} radius={6} pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2563eb", fillOpacity: 1 }}>
              <Popup>
                <strong>HOME</strong>
                <br />
                {home[0].toFixed(6)}, {home[1].toFixed(6)}
              </Popup>
            </CircleMarker>
          </>
        )}
        {trail.length > 1 && (
          <Polyline positions={trail} pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.9, lineCap: "round" }} />
        )}
        {gpsOk && (
          <Marker position={[lat, lon]} icon={droneIcon}>
            <Popup>
              <strong>{drone.flight_mode}</strong>
              <br />
              {drone.armed ? "ARMADO" : "DESARMADO"} · {drone.landed_state}
              <br />
              Lat {drone.latitude.toFixed(6)} · Lon {drone.longitude.toFixed(6)}
              <br />
              Alt {drone.altitude.toFixed(1)} m · {drone.speed.toFixed(1)} m/s · {drone.heading.toFixed(0)}°
              <br />
              GPS {drone.gps_fix_name} · {drone.satellites} sats
            </Popup>
          </Marker>
        )}
      </MapContainer>
      <div className="pointer-events-none absolute left-4 top-4 z-[1000] overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 text-xs text-white shadow-2xl backdrop-blur-md">
        <div className="border-b border-white/10 bg-blue-600/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${gpsOk ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`} />
            <p className="font-semibold">{gpsOk ? "Posición confirmada" : "Esperando fix GPS"}</p>
          </div>
          <p className="mt-1 font-mono text-[10px] text-slate-400">
            {drone.flight_mode} · {drone.connection === "connected" ? "SiK ONLINE" : "ENLACE OFFLINE"}
          </p>
        </div>
        <div className="space-y-2 px-4 py-3">
          <p className="font-mono text-[11px] text-slate-200">
            {gpsOk ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : "GPS_RAW_INT sin posición"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="pointer-events-auto rounded-md border border-blue-400/30 bg-blue-500/15 px-2.5 py-1.5 font-mono text-[10px] text-blue-200 hover:bg-blue-500/25"
              onClick={() => setFollow((v) => !v)}
            >
              {follow ? "SEGUIMIENTO ON" : "MAPA LIBRE"}
            </button>
            <button
              type="button"
              className="pointer-events-auto rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[10px] text-slate-300 hover:bg-white/10"
              onClick={() => setTrail(gpsOk ? [[lat, lon]] : [])}
            >
              LIMPIAR RUTA
            </button>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-5 right-4 z-[1000] grid grid-cols-2 overflow-hidden rounded-xl border border-white/15 bg-slate-950/90 text-white shadow-2xl backdrop-blur-md">
        {[
          ["ALT", `${drone.altitude.toFixed(1)} m`],
          ["VEL", `${drone.speed.toFixed(1)} m/s`],
          ["HDG", `${drone.heading.toFixed(0)}°`],
          ["BAT", `${Math.round(drone.battery)}%`],
        ].map(([label, value]) => (
          <div key={label} className="min-w-24 border-b border-r border-white/10 px-3 py-2.5 last:border-b-0">
            <p className="text-[9px] font-semibold tracking-[0.2em] text-blue-300">{label}</p>
            <p className="mt-0.5 font-mono text-sm">{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
