"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useRef, useEffect } from "react"
import { Play, Pause, Maximize, Gauge, MapPin, Compass, Wind, Activity, Signal } from "lucide-react"

// URL del servidor Flask de Python
const PYTHON_STREAM_URL = "http://localhost:5000/video_feed"

export function LiveVideoView() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  // Usamos ref para el contenedor para poder poner pantalla completa
  const containerRef = useRef<HTMLDivElement>(null)
  
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // 🚀 Iniciar transmisión (En realidad solo mostramos la imagen)
  const startStream = () => {
    setIsPlaying(true)
  }

  // ✋ Detener transmisión (Ocultamos la imagen para ahorrar ancho de banda/recursos visuales)
  const stopStream = () => {
    setIsPlaying(false)
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Timer del tiempo transcurrido
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying])

  // 🖥️ Pantalla completa
  const handleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        document.exitFullscreen()
        setIsFullscreen(false)
      }
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:space-y-6 md:p-8">
      <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-white p-4 shadow-lg md:p-6">
        <h2 className="text-2xl font-bold text-foreground md:text-3xl">Video Procesado (IA)</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Transmisión procesada con Reconocimiento Facial y Telemetría Python
        </p>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden border-0 shadow-2xl">
            {/* Contenedor referenciado para Fullscreen */}
            <div ref={containerRef} className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
              
              {/* VIDEO STREAM DESDE PYTHON */}
              {isPlaying ? (
                // Usamos IMG porque MJPEG es una sucesión de imágenes
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={PYTHON_STREAM_URL}
                  alt="Live Stream from Python"
                  className="h-full w-full object-contain"
                />
              ) : (
                /* Estado de espera / Apagado */
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-center">
                  <Activity className="h-12 w-12 animate-pulse text-blue-400 md:h-16 md:w-16" />
                  <p className="mt-4 font-mono text-base text-blue-300 md:text-lg">
                    Conexión Pausada <br />
                    <span className="text-sm text-gray-400">Asegúrate de ejecutar reconocimiento.py</span>
                  </p>
                </div>
              )}

              {/* Controles inferiores */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  {/* Botones de control */}
                  <div className="flex items-center gap-2 md:gap-3">
                    <Button
                      size="lg"
                      onClick={() => {
                        if (isPlaying) stopStream()
                        else startStream()
                      }}
                      className="gradient-blue shadow-lg hover:scale-105"
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4 md:h-5 md:w-5" />
                      ) : (
                        <Play className="h-4 w-4 md:h-5 md:w-5" />
                      )}
                    </Button>
                    <span className="rounded-lg bg-black/50 px-3 py-1.5 font-mono text-sm font-bold text-white backdrop-blur-sm md:px-4 md:py-2 md:text-lg">
                      {formatTime(elapsedTime)}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden md:flex items-center gap-2 rounded-md bg-black/40 px-3 py-2 text-white backdrop-blur-md">
                        <div className={`h-2 w-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold">{isPlaying ? 'CONECTADO A PYTHON' : 'DESCONECTADO'}</span>
                    </div>

                    {/* Pantalla completa */}
                    <Button
                      size="lg"
                      onClick={handleFullscreen}
                      className="bg-white/90 text-foreground shadow-lg hover:scale-105 hover:bg-white"
                    >
                      <Maximize className="h-4 w-4 md:h-5 md:w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* PANEL DE DATOS ESTÁTICOS (Opcional: Podrías traer estos datos de Python también vía API) */}
        <div className="space-y-4 md:space-y-6">
          <Card className="border-0 bg-white p-4 shadow-xl md:p-6">
            <div className="mb-4 flex items-center gap-3 md:mb-6">
              <div className="rounded-xl bg-blue-100 p-3">
                <Activity className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-base font-bold text-foreground md:text-lg">Estado de Sensores</h3>
            </div>
            {/* Estos datos ahora son visuales en el video, pero aquí dejamos placeholders */}
            <div className="space-y-3 md:space-y-4 text-sm text-gray-500">
                <p>La telemetría en tiempo real (GPS, Altitud, Batería) ahora se visualiza directamente sobre el video gracias al procesamiento de Python.</p>
            </div>
            {/* ... Resto de tus cards de datos si las quieres mantener ... */}
          </Card>
        </div>
      </div>
    </div>
  )
}