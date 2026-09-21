"use client"

import { Camera, ImageIcon, Pause, RefreshCw, Volume2, VolumeX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type RecognitionCamera, useRecognition } from "@/components/useRecognition"
import { cn } from "@/lib/utils"

type RecognitionState = ReturnType<typeof useRecognition>

function cameraHint(camera: RecognitionCamera) {
  if (camera.kind === "skydroid") return "SkyDroid 5.8G"
  if (camera.kind === "hdmi") return "HDMI / Goggles"
  if (camera.kind === "ir") return "IR"
  return "Webcam"
}

function cameraLabel(camera: RecognitionCamera) {
  return camera.name || `Cámara ${camera.index}`
}

export function RecognitionControls({ rec }: { rec: RecognitionState }) {
  const busy = rec.isStarting || rec.switching != null
  const canControl = rec.isPlaying && !rec.isStarting

  return (
    <aside className="flex flex-col border border-border border-t-2 border-t-primary bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="gcs-kicker">Fuentes</p>
          <p className="mt-1 text-sm text-muted-foreground">Cambio desde esta consola, no desde Python.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            variant={rec.isPlaying ? "outline" : "default"}
            disabled={rec.isStarting}
            onClick={() => {
              if (rec.isPlaying || rec.isStarting) rec.stop()
              else rec.start()
            }}
          >
            {rec.isPlaying || rec.isStarting ? "Detener" : "Iniciar"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!canControl || busy} onClick={() => rec.refreshCameras()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-1 p-2">
        {rec.cameras.length === 0 ? (
          <p className="px-2 py-6 text-sm text-muted-foreground">
            {rec.isPlaying ? "Esperando lista de cámaras." : "Inicia el motor para listar fuentes."}
          </p>
        ) : (
          rec.cameras.map((camera, order) => (
            <button
              key={`${camera.index}-${camera.name}-${order}`}
              type="button"
              disabled={!canControl || busy}
              onClick={() => rec.selectCamera(camera.index)}
              className={cn(
                "w-full border-l-2 px-3 py-2.5 text-left transition disabled:opacity-40",
                camera.active
                  ? "border-l-primary bg-secondary/80"
                  : "border-l-transparent hover:bg-secondary/50",
              )}
            >
              <span className="flex items-center gap-2 text-[13px] text-foreground">
                <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                #{camera.index} {cameraLabel(camera)}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                {cameraHint(camera)}
                {camera.width && camera.height ? ` · ${camera.width}×${camera.height}` : ""}
                {camera.active ? " · activa" : ""}
                {rec.switching === camera.index ? " · cambiando" : ""}
              </span>
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Button type="button" variant="outline" size="sm" disabled={!canControl || busy} onClick={() => rec.sendCommand("pause")}>
          <Pause className="h-3.5 w-3.5" />
          {rec.paused ? "Reanudar" : "Pausar"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canControl || busy} onClick={() => rec.sendCommand("capture")}>
          <ImageIcon className="h-3.5 w-3.5" />
          Captura
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canControl || busy} onClick={() => rec.sendCommand("mute")}>
          {rec.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          {rec.muted ? "Audio off" : "Audio"}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canControl || busy} onClick={() => rec.sendCommand("reload_faces")}>
          Identidades
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="col-span-2"
          disabled={!canControl || busy}
          onClick={() => rec.sendCommand("gallery")}
        >
          Galería de eventos
        </Button>
      </div>

      {(rec.error || rec.status) && (
        <p className={cn("border-t border-border px-4 py-2 font-mono text-[11px]", rec.error ? "text-red-400" : "text-muted-foreground")}>
          {rec.error || rec.status}
        </p>
      )}
    </aside>
  )
}
