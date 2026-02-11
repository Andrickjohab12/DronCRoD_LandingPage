"use client"

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { useDronePosition } from "./useDronePosition"
import { Card } from "@/components/ui/card"

export function MissionView() {
  const drone = useDronePosition()

  const droneIcon = L.divIcon({
    html: `<div style="transform: rotate(${drone.heading}deg);">
             <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="blue" stroke="white" stroke-width="1">
               <path d="M12 2l4 8h-3v8h-2v-8h-3z"/>
             </svg>
           </div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:space-y-6 md:p-8">
      <Card className="overflow-hidden border-0 shadow-2xl">
        <div className="relative aspect-video">
          <MapContainer
            center={[drone.latitude, drone.longitude]}
            zoom={15}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            />
            <Marker position={[drone.latitude, drone.longitude]} icon={droneIcon}>
              <Popup>
                <strong>Posición del Dron</strong>
                <br />
                Lat: {drone.latitude.toFixed(6)}°
                <br />
                Lon: {drone.longitude.toFixed(6)}°
                <br />
                Altitud: {drone.altitude} m
                <br />
                Rumbo: {drone.heading}°
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      </Card>
    </div>
  )
}
