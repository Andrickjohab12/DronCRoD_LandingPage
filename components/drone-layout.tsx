"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"

import { LiveVideoView } from "@/components/live-video-view"
import { MissionView } from "@/components/mission-view"
import { MonitorView } from "@/components/monitor-view"
import { StartupScreen } from "@/components/startup-screen"
import { useRecognition } from "@/components/useRecognition"
import { useTelemetry } from "@/components/useTelemetry"

export type ViewType = "monitor" | "video" | "mission"

export function DroneLayout() {
  const [currentView, setCurrentView] = useState<ViewType>("monitor")
  const recognition = useRecognition()
  const telemetry = useTelemetry()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <StartupScreen />
      <Navigation currentView={currentView} onViewChange={setCurrentView} telemetry={telemetry} />
      <main className="flex-1">
        {currentView === "monitor" && <MonitorView telemetry={telemetry} />}
        {currentView === "video" && <LiveVideoView recognition={recognition} />}
        {currentView === "mission" && <MissionView telemetry={telemetry} />}
      </main>
    </div>
  )
}
