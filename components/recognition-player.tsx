"use client"

import { useEffect, useRef, useState } from "react"
import { Maximize, Pause, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useRecognition } from "@/components/useRecognition"
import { cn } from "@/lib/utils"

type RecognitionState = ReturnType<typeof useRecognition>

export function RecognitionPlayer({
  rec,
  className,
}: {
  rec: RecognitionState
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (rec.isPlaying && !rec.paused) {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1)
      }, 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [rec.isPlaying, rec.paused])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <div ref={containerRef} className={cn("relative aspect-video overflow-hidden bg-black", className)}>
      {rec.streamUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rec.streamUrl}
          alt="Reconocimiento en vivo"
          className="pointer-events-none h-full w-full object-contain bg-black"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="max-w-md px-6 text-center font-mono text-sm text-zinc-500">
            {rec.isStarting ? rec.status : rec.error || rec.status || "Motor detenido"}
          </p>
        </div>
      )}

      {(rec.isPlaying || rec.isStarting) && rec.status && (
        <div className="pointer-events-none absolute left-4 top-4 font-mono text-[11px] tracking-wide text-zinc-300">
          {rec.paused ? "IA EN PAUSA" : rec.status}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            aria-label={rec.isPlaying || rec.isStarting ? "Detener motor" : "Iniciar motor"}
            disabled={rec.isStarting}
            onClick={() => {
              if (rec.isPlaying || rec.isStarting) rec.stop()
              else rec.start()
            }}
            className="border-white/20 bg-black/40 text-zinc-100 hover:bg-black/70"
          >
            {rec.isPlaying || rec.isStarting ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <span className="font-mono text-xs text-zinc-300">{formatTime(elapsedTime)}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleFullscreen}
          className="border-white/20 bg-black/40 text-zinc-100 hover:bg-black/70"
          aria-label="Pantalla completa"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
