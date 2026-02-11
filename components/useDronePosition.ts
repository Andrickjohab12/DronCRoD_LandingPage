"use client"

import { useState, useEffect } from "react"

interface DronePosition {
  latitude: number
  longitude: number
  altitude: number
  heading: number
}

export function useDronePosition() {
  const [position, setPosition] = useState<DronePosition>({
    latitude: 32.5464977,
    longitude: -116.9009348,
    altitude: 50,
    heading: 90,
  })

  useEffect(() => {
    // Simula movimiento del dron
    const interval = setInterval(() => {
      setPosition((prev) => ({
        ...prev,
        latitude: prev.latitude + (Math.random() - 0.5) * 0.0002,
        longitude: prev.longitude + (Math.random() - 0.5) * 0.0002,
        heading: (prev.heading + 10) % 360,
      }))
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  return position
}
