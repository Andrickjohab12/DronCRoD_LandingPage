"use client"
import { useEffect, useState } from "react"

interface WeatherData {
  temperature: number
  windSpeed: number
  humidity: number
  condition: string
  locationName: string
}

export function useWeather(lat?: number, lon?: number) {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async (latitude: number, longitude: number) => {
      const apiKey = "167769f34dcfb9f77b8639bba4e5c8d4"
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&lang=es&appid=${apiKey}`
        const response = await fetch(url)
        if (!response.ok) throw new Error("clima")
        const data = await response.json()
        if (cancelled) return
        setWeather({
          temperature: data.main.temp,
          windSpeed: data.wind.speed,
          humidity: data.main.humidity,
          condition: data.weather[0].description,
          locationName: data.name,
        })
      } catch {
        /* keep last weather */
      }
    }

    if (lat != null && lon != null && Math.abs(lat) > 0.01) {
      void load(lat, lon)
      return () => {
        cancelled = true
      }
    }

    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void load(position.coords.latitude, position.coords.longitude)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [lat, lon])

  return weather
}
