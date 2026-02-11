"use client"
import { useEffect, useState } from "react"

interface WeatherData {
  temperature: number
  windSpeed: number
  humidity: number
  condition: string
  locationName: string
}

export function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("❌ Geolocalización no soportada por este navegador.")
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        console.log("📍 Coordenadas detectadas:", latitude, longitude)

        const apiKey = "167769f34dcfb9f77b8639bba4e5c8d4"

        try {
          const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&lang=es&appid=${apiKey}`
          console.log("🌐 Consultando API:", url)

          const response = await fetch(url)
          if (!response.ok) throw new Error("Error al obtener datos del clima")

          const data = await response.json()
          console.log("✅ Respuesta API:", data)

          setWeather({
            temperature: data.main.temp,
            windSpeed: data.wind.speed,
            humidity: data.main.humidity,
            condition: data.weather[0].description,
            locationName: data.name,
          })
        } catch (err) {
          console.error("⚠️ Error obteniendo clima:", err)
        }
      },
      (error) => {
        console.error("🚫 Error de geolocalización:", error)
      }
    )
  }, [])

  return weather
}
