"use client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useState, useEffect, useRef } from "react"

import {
  Battery,
  Wifi,
  Satellite,
  Gauge,
  MapPin,
  Clock,
  Thermometer,
  Wind,
  Compass,
  Radio,
  Activity,
  Zap,
  Cpu,
  Network,
  Shield,
  Play,
  Pause,
  Maximize,
  Droplets,
  Cloud,
} from "lucide-react"
import { useTelemetry } from "./useTelemetry"
import { useWeather } from "./useweather" // 🌦️ Importa el hook del clima

interface DroneStats {
  battery: number
  connection: "connected" | "disconnected" | "weak"
  satellites: number
  altitude: number
  speed: number
  latitude: number
  longitude: number
  flightTime: number
  temperature: number
  windSpeed: number
  heading: number
  signalStrength: number
}

export function MonitorView() {
  const stats = useTelemetry()
  const weather = useWeather() // 🌦️ Hook del clima
  const [elapsedTime, setElapsedTime] = useState(0) // segundos totales
const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)


  const getBatteryColor = (battery: number) => {
    if (battery > 50) return "text-green-500"
    if (battery > 20) return "text-yellow-500"
    return "text-red-500"
  }

  const getConnectionColor = (connection: string) => {
    if (connection === "connected") return "text-green-500"
    if (connection === "weak") return "text-yellow-500"
    return "text-gray-400"
  }

  

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
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


  // refs y estado adicionales para el video
const [cameraStatus, setCameraStatus] = useState<string>("Esperando conexión...")
const videoRef = useRef<HTMLVideoElement | null>(null)
const videoContainerRef = useRef<HTMLDivElement | null>(null)

// Función para entrar/salir fullscreen SOLO del contenedor de video
const handleFullscreen = () => {
  if (!document.fullscreenElement) {
    videoContainerRef.current?.requestFullscreen()
    setIsFullscreen(true)
  } else {
    document.exitFullscreen()
    setIsFullscreen(false)
  }
}

// Inicia stream para la cámara "USB2.0 PC CAMERA"
const startCameraStream = async (deviceId?: string) => {
  try {
    const constraints = deviceId
      ? { video: { deviceId: { exact: deviceId } }, audio: false }
      : { video: true, audio: false }

    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setIsPlaying(true)
      setCameraStatus("🎥 Cámara del dron conectada ✅")
    }
  } catch (err) {
    console.error("Error al acceder a la cámara:", err)
    setCameraStatus("Error al conectar la cámara")
  }
}

// Detener stream
const stopCameraStream = () => {
  if (videoRef.current && videoRef.current.srcObject) {
    const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
    tracks.forEach((t) => t.stop())
    videoRef.current.srcObject = null
  }
  setIsPlaying(false)
  setCameraStatus("Esperando conexión...")
}

// Auto-detectar y conectar la cámara USB2.0 PC CAMERA al montar
useEffect(() => {
  let mounted = true
  const init = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cam = all.find(
        (d) => d.kind === "videoinput" && d.label.toLowerCase().includes("usb2.0 pc camera")
      )
      if (!mounted) return
      if (cam) {
        // arranca el stream con el deviceId encontrado
        await startCameraStream(cam.deviceId)
      } else {
        setCameraStatus("🔌 No se detectó la cámara del dron")
      }
    } catch (err) {
      console.error("Error al buscar cámara:", err)
      setCameraStatus("Error al buscar cámaras")
    }
  }
  init()
  return () => {
    mounted = false
    stopCameraStream()
  }
}, [])




  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:space-y-6 md:p-8">
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-50 via-blue-100/50 to-white p-4 shadow-lg md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h2 className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            Panel de Monitoreo
          </h2>
          <p className="mt-2 text-sm text-blue-600/70">Estadísticas en tiempo real del dron</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-2 shadow-md md:px-6 md:py-3">
           <div
            className={`h-4 w-4 rounded-full ${
              stats.connection === "connected" ? "bg-blue-500 shadow-lg shadow-blue-500/50" : "bg-gray-400"
            } animate-pulse`}
          />
          <span className="font-mono text-base font-bold text-blue-700 md:text-lg">
            {stats.connection === "connected" ? "CONECTADO" : "DESCONECTADO"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
        <Card className="group relative overflow-hidden border-0 bg-blue-600 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Batería</p>
              <p className={`font-mono text-4xl font-bold text-white md:text-5xl ${getBatteryColor(stats.battery)}`}>
                {stats.battery.toFixed(2)}%
              </p>
            </div>
            <Battery className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-500 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Conexión</p>
              <p className={`font-mono text-4xl font-bold text-white md:text-5xl ${getConnectionColor(stats.connection)}`}>
                {stats.connection === "connected" ? "OK" : "OFF"}
              </p>
            </div>
            <Wifi className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-700 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Satélites GPS</p>
                <p className="font-mono text-4xl font-bold text-white md:text-5xl">{stats.satellites}</p>
            </div>
            <Satellite className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-400 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Tiempo Vuelo</p>
              <p className="font-mono text-4xl font-bold text-white md:text-5xl"></p>
            </div>
            <Clock className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Datos de Vuelo</h3>
          </div>
          <div className="space-y-4 md:space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Altitud</span>
              </div>
               <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
                {stats.altitude.toFixed(2)} m
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Velocidad</span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">{stats.speed.toFixed(2)} m/s</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Compass className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Rumbo</span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">5°</span>
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <MapPin className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Posición GPS</h3>
          </div>
          <div className="space-y-4 md:space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Latitud</span>
              </div>
               <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
                {stats.latitude.toFixed(6)}°
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Longitud</span>
              </div>
             <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
                {stats.longitude.toFixed(6)}°
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Radio className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Señal</span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
               12%
              </span>
            </div>
          </div>
        </Card>

        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Thermometer className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Condiciones</h3>
          </div>
          <div className="space-y-4 md:space-y-5">
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Thermometer className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
            <span className="text-sm font-semibold text-foreground md:text-base">
  Temperatura 
</span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
              {weather?.temperature?.toFixed(1)  ?? "Cargando..."}  °C
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Wind className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Viento  y Humedad</span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">
             {weather?.windSpeed?.toFixed(1) ?? "Cargando..."}m/s y  {weather?.humidity?.toFixed(1)  ?? "Cargando..."} %
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Cloud className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Condicion:
  </span>
              </div>
              <span className="font-mono text-lg font-bold text-blue-600 md:text-xl">{weather?.condition ?? "Cargando ubicación..."} 
</span>
            </div>
          </div>
        </Card>
      </div>




      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <div ref={videoContainerRef} className="relative aspect-video bg-gradient-to-br from-slate-900 to-slate-800">
  {/* video element */}
  <video
    ref={videoRef}
    autoPlay
    playsInline
    muted
    className="h-full w-full object-cover"
  />

  {/* overlay: cuando no está reproduciendo muestra estado (mantiene estilo) */}
  {!isPlaying && (
    <div className="absolute inset-0 flex h-full items-center justify-center">
      <div className="text-center">
        <Activity className="mx-auto h-12 w-12 animate-pulse text-blue-400 md:h-16 md:w-16" />
        <p className="mt-4 font-mono text-base text-blue-300 md:text-lg">
          {cameraStatus}
        </p>
      </div>
    </div>
  )}

  {/* Controles inferiores (mantienen tus clases) */}
  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 md:p-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 md:gap-3">
        <Button
          size="lg"
          onClick={() => {
            if (isPlaying) {
              stopCameraStream()
            } else {
              // si ya hay stream iniciado por auto-detect, play() se encarga; de lo contrario intenta iniciar
              if (videoRef.current && (videoRef.current.srcObject as MediaStream)) {
                // si hay stream solo pausar/reanudar video HTML
                const v = videoRef.current
                if (v.paused) v.play()
                else v.pause()
                setIsPlaying(!v.paused)
              } else {
                startCameraStream()
              }
            }
          }}
          className="gradient-blue shadow-lg hover:scale-105"
        >
          {isPlaying ? <Pause className="h-4 w-4 md:h-5 md:w-5" /> : <Play className="h-4 w-4 md:h-5 md:w-5" />}
        </Button>

        <span className="rounded-lg bg-black/50 px-3 py-1.5 font-mono text-sm font-bold text-white backdrop-blur-sm md:px-4 md:py-2 md:text-lg">
       {formatTime(elapsedTime)}

        </span>
      </div>

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




        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Cpu className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Sistema Técnico</h3>
          </div>
          <div className="space-y-3 md:space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Autopiloto</span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600 md:text-sm">PX4</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Protocolo</span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600 md:text-sm">MAVLink</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Cpu className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Firmware</span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600 md:text-sm">v1.14.0</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <div className="flex items-center gap-3">
                <Radio className="h-5 w-5 text-blue-600 md:h-6 md:w-6" />
                <span className="text-sm font-semibold text-foreground md:text-base">Telemetría</span>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600 md:text-sm">915 MHz</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
