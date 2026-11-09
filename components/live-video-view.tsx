"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useCallback, useEffect, useRef, useState } from "react"
import { Activity, Camera, CameraOff, Maximize, RefreshCw, ScanSearch, Users, Zap } from "lucide-react"

type Detection = { x: number; y: number; width: number; height: number; label: string; confidence: number; trackId?: number; polygon?: [number, number][] }
type DetectionMessage = { type: string; detections?: Detection[]; personCount?: number; inferenceMs?: number; error?: string; model?: string; status?: string; elapsedSeconds?: number }

const VISION_SOCKET_URL = "ws://127.0.0.1:8769"
const MAX_FRAME_WIDTH = 960
const FRAME_INTERVAL_MS = 100

export function LiveVideoView() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const animationRef = useRef<number | null>(null)
  const pendingFrameRef = useRef(false)
  const nextFrameRef = useRef(0)
  const readyResolverRef = useRef<((value: void) => void) | null>(null)
  const readyRejecterRef = useRef<((reason: Error) => void) | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [status, setStatus] = useState("Selecciona una cámara y pulsa iniciar.")
  const [error, setError] = useState("")
  const [detections, setDetections] = useState<Detection[]>([])
  const [personCount, setPersonCount] = useState(0)
  const [inferenceMs, setInferenceMs] = useState(0)

  const refreshCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError("Este navegador no permite acceder a cámaras. Abre la página en localhost o HTTPS.")
      return [] as MediaDeviceInfo[]
    }
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput")
    setCameras(devices)
    if (!cameraId && devices[0]) setCameraId(devices[0].deviceId)
    return devices
  }, [cameraId])

  useEffect(() => {
    void refreshCameras()
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshCameras)
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshCameras)
  }, [refreshCameras])

  const drawDetections = useCallback((items: Detection[]) => {
    const video = videoRef.current
    const canvas = overlayRef.current
    const container = containerRef.current
    if (!video || !canvas || !container || !video.videoWidth || !video.videoHeight) return
    const dpr = window.devicePixelRatio || 1
    const width = container.clientWidth
    const height = container.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    const scale = Math.min(width / video.videoWidth, height / video.videoHeight)
    const offsetX = (width - video.videoWidth * scale) / 2
    const offsetY = (height - video.videoHeight * scale) / 2
    items.forEach((detection, index) => {
      const personId = detection.trackId ?? index + 1
      const hue = (personId * 137.508) % 360
      const color = `hsl(${hue} 92% 62%)`
      const x = offsetX + detection.x * scale
      const y = offsetY + detection.y * scale
      const boxWidth = detection.width * scale
      const boxHeight = detection.height * scale
      const label = `PERSONA #${String(personId).padStart(2, "0")}  ${Math.round(detection.confidence * 100)}%`
      const fontSize = Math.max(12, Math.min(15, width / 90))
      if (detection.polygon && detection.polygon.length > 2) {
        ctx.beginPath()
        detection.polygon.forEach(([px, py], pointIndex) => {
          const screenX = offsetX + px * scale
          const screenY = offsetY + py * scale
          if (pointIndex === 0) ctx.moveTo(screenX, screenY)
          else ctx.lineTo(screenX, screenY)
        })
        ctx.closePath()
        ctx.fillStyle = `hsla(${hue}, 92%, 62%, 0.2)`
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.strokeRect(x, y, boxWidth, boxHeight)
      ctx.font = `700 ${fontSize}px system-ui, sans-serif`
      const labelWidth = ctx.measureText(label).width + 18
      const labelHeight = fontSize + 13
      const labelY = Math.max(0, y - labelHeight)
      ctx.fillStyle = color
      ctx.fillRect(x, labelY, labelWidth, labelHeight)
      ctx.fillStyle = "#071526"
      ctx.fillText(label, x + 9, labelY + fontSize + 2)
    })
  }, [])

  const stopCamera = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    pendingFrameRef.current = false
    readyResolverRef.current = null
    readyRejecterRef.current = null
    socketRef.current?.close()
    socketRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    const ctx = overlayRef.current?.getContext("2d")
    if (ctx && overlayRef.current) ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height)
    setDetections([])
    setPersonCount(0)
    setInferenceMs(0)
    setIsRunning(false)
    setIsLoading(false)
    setStatus("Cámara desconectada.")
  }, [])

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current)
    socketRef.current?.close()
    streamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const handleMessage = useCallback((event: MessageEvent) => {
    let message: DetectionMessage
    try {
      message = JSON.parse(String(event.data)) as DetectionMessage
    } catch {
      return
    }
    if (message.type === "loading") {
      const elapsed = message.elapsedSeconds ? ` · ${message.elapsedSeconds}s` : ""
      setStatus(`${message.model || "YOLO"}: ${message.status || "cargando"}${elapsed}`)
      return
    }
    if (message.type === "error") {
      const problem = message.error || "Error del detector Python."
      setError(problem)
      readyRejecterRef.current?.(new Error(problem))
      pendingFrameRef.current = false
      return
    }
    if (message.type === "ready") {
      readyResolverRef.current?.()
      readyResolverRef.current = null
      readyRejecterRef.current = null
      setStatus(`${message.model || "YOLO26n-seg"} listo · análisis local en la laptop.`)
      return
    }
    if (message.type === "detections") {
      pendingFrameRef.current = false
      const nextDetections = message.detections || []
      setDetections(nextDetections)
      setPersonCount(message.personCount || 0)
      setInferenceMs(message.inferenceMs || 0)
      drawDetections(nextDetections)
    }
  }, [drawDetections])

  const processFrames = useCallback((time: number) => {
    const video = videoRef.current
    const socket = socketRef.current
    if (!video || !socket || socket.readyState !== WebSocket.OPEN) {
      animationRef.current = requestAnimationFrame(processFrames)
      return
    }
    if (time >= nextFrameRef.current && !pendingFrameRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      nextFrameRef.current = time + FRAME_INTERVAL_MS
      const capture = captureCanvasRef.current || document.createElement("canvas")
      captureCanvasRef.current = capture
      const ratio = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth)
      capture.width = Math.max(1, Math.round(video.videoWidth * ratio))
      capture.height = Math.max(1, Math.round(video.videoHeight * ratio))
      const ctx = capture.getContext("2d", { alpha: false })
      if (ctx) {
        ctx.drawImage(video, 0, 0, capture.width, capture.height)
        pendingFrameRef.current = true
        capture.toBlob(async (blob) => {
          if (!blob || socket.readyState !== WebSocket.OPEN) {
            pendingFrameRef.current = false
            return
          }
          try {
            socket.send(await blob.arrayBuffer())
          } catch {
            pendingFrameRef.current = false
          }
        }, "image/jpeg", 0.78)
      }
    }
    animationRef.current = requestAnimationFrame(processFrames)
  }, [])

  const connectDetector = async () => {
    const response = await fetch("/api/vision/start", { method: "POST" })
    const payload = await response.json() as { started: boolean; error?: string }
    if (!response.ok || !payload.started) throw new Error(payload.error || "No se pudo iniciar el servicio YOLO local.")
    const socket = new WebSocket(VISION_SOCKET_URL)
    socket.binaryType = "arraybuffer"
    socketRef.current = socket
    socket.addEventListener("message", handleMessage)
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("YOLO sigue cargando después de cinco minutos. Comprueba la conexión y vuelve a iniciar.")), 300000)
      readyResolverRef.current = () => { window.clearTimeout(timeout); resolve() }
      readyRejecterRef.current = (reason) => { window.clearTimeout(timeout); reject(reason) }
      socket.addEventListener("error", () => {
        window.clearTimeout(timeout)
        reject(new Error("No hay conexión con el servicio Python. Revisa que esté escuchando en localhost:8767."))
      }, { once: true })
      socket.addEventListener("close", () => {
        window.clearTimeout(timeout)
        reject(new Error("El servicio Python se desconectó."))
      }, { once: true })
    })
    return socket
  }

  const startCamera = async (requestedCameraId = cameraId) => {
    setError("")
    setIsLoading(true)
    setStatus("Abriendo cámara y preparando YOLO en Python…")
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("La webcam requiere permiso y una página abierta en localhost o HTTPS.")
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: requestedCameraId
          ? { deviceId: { exact: requestedCameraId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }
          : { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const devices = await refreshCameras()
      const actualId = stream.getVideoTracks()[0]?.getSettings().deviceId
      if (actualId) setCameraId(actualId)
      if (!devices.length) throw new Error("No se encontró una webcam disponible.")
      await connectDetector()
      setIsLoading(false)
      setIsRunning(true)
      animationRef.current = requestAnimationFrame(processFrames)
    } catch (cause) {
      socketRef.current?.close()
      socketRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setIsLoading(false)
      setIsRunning(false)
      setStatus("No se pudo iniciar el reconocimiento.")
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar la cámara y el detector.")
    }
  }

  const selectCamera = (nextCameraId: string) => {
    setCameraId(nextCameraId)
    if (isRunning) {
      stopCamera()
      window.setTimeout(() => void startCamera(nextCameraId), 0)
    }
  }

  const handleFullscreen = async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch {
      setError("El navegador no permitió abrir pantalla completa.")
    }
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-5 p-4 md:p-8">
      <div className="rounded-2xl bg-gradient-to-r from-blue-50 to-white p-5 shadow-lg md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Visión artificial · Python local</p>
            <h2 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">Seguimiento de siluetas humanas</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">YOLO26 segmenta únicamente personas. Cada silueta y su caja reciben un color e identificador para distinguir varias personas a la vez.</p>
          </div>
          <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${isRunning ? "bg-emerald-50 text-emerald-700" : isLoading ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${isRunning ? "animate-pulse bg-emerald-500" : isLoading ? "animate-pulse bg-amber-500" : "bg-slate-400"}`} />
            {isLoading ? "Preparando motor IA" : isRunning ? "Reconocimiento activo" : "En espera"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_350px]">
        <Card className="overflow-hidden border-0 bg-slate-950 shadow-2xl">
          <div ref={containerRef} className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#050b12]">
            <video ref={videoRef} className={`absolute inset-0 h-full w-full object-contain ${isRunning || isLoading ? "" : "hidden"}`} autoPlay muted playsInline />
            <canvas ref={overlayRef} className={`pointer-events-none absolute inset-0 h-full w-full ${isRunning || isLoading ? "" : "hidden"}`} />
            {!isRunning && !isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 p-5"><ScanSearch className="h-12 w-12 text-cyan-300" /></div>
                <h3 className="mt-5 text-lg font-semibold text-white">Listo para analizar</h3>
                <p className="mt-2 max-w-md text-sm text-slate-400">Selecciona la webcam conectada al receptor USB y pulsa iniciar reconocimiento.</p>
              </div>
            )}
            {isLoading && <div className="absolute inset-0 flex items-end justify-center bg-black/25 pb-14"><div className="flex items-center gap-3 rounded-xl bg-slate-950/85 px-5 py-3 text-sm text-white backdrop-blur"><RefreshCw className="h-4 w-4 animate-spin text-cyan-300" />{status}</div></div>}
            {isRunning && <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"/>YOLO26 SEG · SOLO PERSONAS</div>}
            <Button variant="secondary" size="icon" onClick={() => void handleFullscreen()} className="absolute right-4 top-4 bg-black/60 text-white hover:bg-black/80" aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}><Maximize className="h-4 w-4" /></Button>
            {isRunning && <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-xs font-mono text-white backdrop-blur"><Zap className="h-3.5 w-3.5 text-amber-300"/>{inferenceMs.toFixed(0)} ms por fotograma</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-slate-900 px-4 py-4 md:px-6">
            <p className="text-sm text-slate-300">{status}</p>
            <Button onClick={() => isRunning ? stopCamera() : void startCamera()} disabled={isLoading} className={isRunning ? "bg-rose-600 text-white hover:bg-rose-700" : "gradient-blue text-white"}>
              {isRunning ? <><CameraOff className="mr-2 h-4 w-4"/>Detener reconocimiento</> : isLoading ? <><RefreshCw className="mr-2 h-4 w-4 animate-spin"/>Iniciando…</> : <><Camera className="mr-2 h-4 w-4"/>Iniciar reconocimiento</>}
            </Button>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="border-0 p-5 shadow-lg">
            <label htmlFor="camera-select" className="mb-2 block text-sm font-semibold text-slate-800">Cámara de entrada</label>
            <select id="camera-select" value={cameraId} onChange={(event) => selectCamera(event.target.value)} disabled={isLoading} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
              {cameras.length === 0 && <option value="">Permite acceso para listar cámaras</option>}
              {cameras.map((camera, index) => <option key={camera.deviceId || index} value={camera.deviceId}>{camera.label || `Cámara ${index + 1}`}</option>)}
            </select>
            <button type="button" onClick={() => void refreshCameras()} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-800"><RefreshCw className="h-3.5 w-3.5"/>Actualizar cámaras</button>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">El receptor USB debe aparecer en Windows como cámara de video.</p>
          </Card>

          <Card className="border-0 p-5 shadow-lg">
            <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600"/><h3 className="font-semibold text-slate-900">Personas en el cuadro</h3></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-emerald-700"><Users className="h-4 w-4"/><span className="text-xs font-semibold">Personas</span></div><p className="mt-2 font-mono text-3xl font-bold text-emerald-800">{personCount}</p></div>
              <div className="rounded-xl bg-blue-50 p-4"><div className="flex items-center gap-2 text-blue-700"><Zap className="h-4 w-4"/><span className="text-xs font-semibold">Inferencia</span></div><p className="mt-2 font-mono text-3xl font-bold text-blue-800">{inferenceMs.toFixed(0)}<span className="ml-1 text-sm">ms</span></p></div>
            </div>
            <div className="mt-4 space-y-2">
              {detections.length === 0 ? <p className="text-sm text-slate-500">{isRunning ? "No se detectan personas en este cuadro." : "Inicia para ver las detecciones."}</p> : detections.slice(0, 12).map((item, index) => {
                const personId = item.trackId ?? index + 1
                const hue = (personId * 137.508) % 360
                return <div key={`${personId}-${index}`} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0"><span className="flex items-center gap-2 text-slate-700"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: `hsl(${hue} 92% 48%)` }}/><span className="font-mono text-xs">#{String(personId).padStart(2, "0")}</span><span>Persona</span></span><span className="font-mono text-slate-500">{Math.round(item.confidence * 100)}%</span></div>
              })}
            </div>
          </Card>

          <Card className="border-0 bg-slate-900 p-5 text-white shadow-lg">
            <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-amber-300"/><p className="text-sm font-semibold">YOLO26n-seg · ByteTrack</p></div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">Segmenta solo la clase persona y conserva un ID temporal por cuerpo mientras se mueve. Usa GPU compatible cuando está disponible.</p>
            {error && <div role="alert" className="mt-4 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs leading-relaxed text-rose-200">{error}</div>}
          </Card>
        </div>
      </div>
      <p className="px-1 text-xs text-slate-500">El video se procesa en esta laptop. Los colores e IDs distinguen siluetas durante el seguimiento; no reconocen la identidad de las personas.</p>
    </div>
  )
}
