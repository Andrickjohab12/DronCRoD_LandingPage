"use client"

import { useState } from "react"
import { Navigation } from "@/components/navigation"

import { LiveVideoView } from "@/components/live-video-view"
import { MissionView } from "@/components/mission-view"
import { MonitorView } from "@/components/monitor-view"

export type ViewType = "monitor" | "video" | "mission"

export function DroneLayout() {
  const [currentView, setCurrentView] = useState<ViewType>("monitor")

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1">
        {currentView === "monitor" && <MonitorView />}
        {currentView === "video" && <LiveVideoView />}
        {currentView === "mission" && <MissionView />}
      </main>
    </div>
  )
}
