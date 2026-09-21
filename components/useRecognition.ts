"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export const RECOGNITION_STREAM_PATH = "/api/reconocimiento"

export type RecognitionCamera = {
  index: number
  name: string
  backend: string
  width: number
  height: number
  active: boolean
  kind: "laptop" | "skydroid" | "hdmi" | "ir" | "other" | string
}

type StreamStatus = {
  ready?: boolean
  phase?: string
  fps?: number
  people?: number
  identities?: number
  events?: number
  paused?: boolean
  muted?: boolean
  camera?: { index: number; name: string; kind?: string } | null
  cameras?: RecognitionCamera[]
  message?: string
  ok?: boolean
  url?: string
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function useRecognition() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [status, setStatus] = useState("Esperando conexión...")
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<RecognitionCamera[]>([])
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [stats, setStats] = useState({ fps: 0, people: 0, identities: 0, events: 0 })
  const [switching, setSwitching] = useState<number | null>(null)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const startingRef = useRef(false)
  const switchingRef = useRef(false)
  const playingRef = useRef(false)
  playingRef.current = isPlaying || isStarting

  const applyStatus = useCallback((data: StreamStatus) => {
    if (Array.isArray(data.cameras)) setCameras(data.cameras)
    setStats({
      fps: data.fps ?? 0,
      people: data.people ?? 0,
      identities: data.identities ?? 0,
      events: data.events ?? 0,
    })
    if (typeof data.paused === "boolean") setPaused(data.paused)
    if (typeof data.muted === "boolean") setMuted(data.muted)
    if (data.message) setStatus(data.message)
  }, [])

  const fetchStreamStatus = useCallback(async () => {
    const res = await fetch(`${RECOGNITION_STREAM_PATH}/live`, { cache: "no-store" })
    if (!res.ok) throw new Error("El motor de reconocimiento no responde")
    return (await res.json()) as StreamStatus
  }, [])

  const attachStream = useCallback(
    async (message = "IA de reconocimiento activa") => {
      try {
        const data = await fetchStreamStatus()
        applyStatus(data)
      } catch {
        /* show the player while Python finishes */
      }
      setStreamUrl(`${RECOGNITION_STREAM_PATH}/video?t=${Date.now()}`)
      setIsPlaying(true)
      setStatus(message)
      setError(null)
    },
    [applyStatus, fetchStreamStatus],
  )

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (cancelled || playingRef.current) return
      try {
        const local = await fetch("/api/reconocimiento/status", { cache: "no-store" })
        const payload = await local.json()
        if (cancelled || !payload.running) return
        await attachStream("IA de reconocimiento activa")
      } catch {
        /* still stopped */
      }
    }
    void tick()
    const id = window.setInterval(() => {
      if (!startingRef.current) void tick()
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [attachStream])

  useEffect(() => {
    if (!isPlaying) return
    const id = window.setInterval(async () => {
      try {
        const data = await fetchStreamStatus()
        applyStatus(data)
      } catch {
        /* keep last known status while the stream recovers */
      }
    }, 1500)
    return () => window.clearInterval(id)
  }, [applyStatus, fetchStreamStatus, isPlaying])

  const start = useCallback(async () => {
    if (startingRef.current || isPlaying) return
    startingRef.current = true
    setIsStarting(true)
    setError(null)
    setStatus("Iniciando IA de reconocimiento...")
    try {
      const res = await fetch("/api/reconocimiento/start", { method: "POST" })
      const payload = await res.json()
      if (!res.ok || payload.ok === false) {
        throw new Error(payload.error || "No se pudo iniciar Reconocimiento")
      }

      setStreamUrl(`${RECOGNITION_STREAM_PATH}/video?t=${Date.now()}`)
      const deadline = Date.now() + 90000
      while (Date.now() < deadline) {
        try {
          const data = await fetchStreamStatus()
          applyStatus(data)
          if (data.phase === "models") setStatus("Cargando modelos YOLO / YuNet / SFace...")
          if (data.phase === "camera") setStatus("Abriendo webcam de la laptop...")
          if (data.ready || data.phase === "ready") {
            await attachStream("Motor listo · cambia de cámara con los botones de abajo")
            return
          }
        } catch {
          setStatus("Arrancando motor Python...")
        }
        await wait(1000)
      }
      throw new Error("El reconocimiento tardó demasiado en iniciar")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al iniciar el reconocimiento"
      setError(message)
      setStatus(message)
      setIsPlaying(false)
      setStreamUrl(null)
    } finally {
      startingRef.current = false
      setIsStarting(false)
    }
  }, [applyStatus, attachStream, fetchStreamStatus, isPlaying])

  const stop = useCallback(async () => {
    setIsStarting(false)
    setIsPlaying(false)
    setStreamUrl(null)
    setPaused(false)
    setStatus("Esperando conexión...")
    try {
      await fetch("/api/reconocimiento/stop", { method: "POST" })
    } catch {
      /* UI already stopped */
    }
  }, [])

  const refreshCameras = useCallback(async () => {
    const res = await fetch(`${RECOGNITION_STREAM_PATH}/cameras?refresh=1`, { cache: "no-store" })
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data.cameras)) setCameras(data.cameras)
  }, [])

  const sendCommand = useCallback(async (cmd: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(`${RECOGNITION_STREAM_PATH}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cmd, ...extra }),
    })
    const data = (await res.json()) as StreamStatus
    applyStatus(data)
    if (!res.ok || data.ok === false) {
      const message = data.message || "No se pudo enviar el comando"
      setError(message)
      setStatus(message)
      return data
    }
    setError(null)
    if (data.message) setStatus(data.message)
    if (data.url && typeof window !== "undefined") window.open(data.url, "_blank")
    return data
  }, [applyStatus])

  const selectCamera = useCallback(
    async (index: number) => {
      if (switchingRef.current) return
      switchingRef.current = true
      setSwitching(index)
      setError(null)
      setStatus(`Cambiando a cámara #${index}...`)
      try {
        const data = await sendCommand("camera", { index })
        if (data.ok === false) return
        setStreamUrl(`${RECOGNITION_STREAM_PATH}/video?t=${Date.now()}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo cambiar de cámara"
        setError(message)
        setStatus(message)
      } finally {
        switchingRef.current = false
        setSwitching(null)
      }
    },
    [sendCommand],
  )

  return {
    isPlaying,
    isStarting,
    status,
    error,
    cameras,
    streamUrl,
    stats,
    switching,
    paused,
    muted,
    start,
    stop,
    selectCamera,
    refreshCameras,
    sendCommand,
  }
}

export type TelemetryRecognition = ReturnType<typeof useRecognition>
export type RecognitionState = ReturnType<typeof useRecognition>
