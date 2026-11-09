"use client"

import { useTelemetry } from "./useTelemetry"

export function useDronePosition() {
  const { data } = useTelemetry()

  return {
    latitude:  data.latitude,
    longitude: data.longitude,
    altitude:  data.altitude,
    heading:   data.heading,
    speed:     data.speed,
    connection: data.connection,
  }
}