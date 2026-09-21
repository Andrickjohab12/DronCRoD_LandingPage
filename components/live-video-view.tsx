"use client"

import { RecognitionPlayer } from "./recognition-player"
import { RecognitionControls } from "./recognition-controls"
import { useRecognition } from "./useRecognition"

type RecognitionState = ReturnType<typeof useRecognition>

export function LiveVideoView({ recognition }: { recognition: RecognitionState }) {
  const active = recognition.cameras.find((item) => item.active)
  const motor = recognition.isStarting ? "Iniciando" : recognition.isPlaying ? "En vivo" : "Detenido"

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="gcs-kicker">Reconocimiento</p>
          <h2 className="mt-1 text-xl font-medium tracking-tight">Cámara en tiempo real</h2>
          <div className="brand-rule mt-2 h-px w-32" />
          <p className="mt-1 text-sm text-muted-foreground">
            El vídeo es solo visualización. Las cámaras y atajos se controlan desde este panel.
          </p>
        </div>
        <div className="flex flex-wrap gap-6 font-mono text-xs text-muted-foreground">
          <span>
            Motor <span className="text-foreground">{motor}</span>
          </span>
          <span>
            Personas <span className="text-foreground">{recognition.stats.people}</span>
          </span>
          <span>
            FPS <span className="text-foreground">{recognition.stats.fps.toFixed(1)}</span>
          </span>
          <span className="max-w-[220px] truncate">
            Fuente <span className="text-foreground">{active?.name || "—"}</span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
        <div className="overflow-hidden border border-border border-t-2 border-t-primary">
          <RecognitionPlayer rec={recognition} />
        </div>
        <RecognitionControls rec={recognition} />
      </div>
    </div>
  )
}
