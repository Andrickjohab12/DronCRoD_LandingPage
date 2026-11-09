"use client"
 {/* Practicamente es el index, de aqui se leen todas las demas paginas */}
import { useState } from "react"
import { Navigation } from "@/components/navigation"
import { LiveVideoView } from "@/components/live-video-view"
import { MissionView } from "@/components/mission-view"
import { MonitorView } from "@/components/monitor-view"
import { Commands } from "@/components/commands"  

export type ViewType = "monitor" | "commands" | "video" | "mission"

export function DroneLayout() {
  const [currentView, setCurrentView] = useState<ViewType>("monitor")

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navigation currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 p-4 md:p-8">
        {currentView === "monitor"  && <MonitorView />}
        {currentView === "commands" && <Commands />}
        {currentView === "video"    && <LiveVideoView />}
        {currentView === "mission"  && <MissionView />}
      </main>
    </div>
  )
}