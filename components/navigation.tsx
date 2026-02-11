"use client"

import type { ViewType } from "@/components/drone-layout"
import { Clock, CloudSun, Gauge, Video, Map, ImageIcon } from "lucide-react"
import { useEffect, useState } from "react"

interface NavigationProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
}

export function Navigation({ currentView, onViewChange }: NavigationProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <nav className="border-b border-border/50 bg-gradient-to-r from-white via-blue-50/50 to-white shadow-sm backdrop-blur-sm">
      <div className="mx-auto flex h-auto min-h-[80px] max-w-[1800px] flex-col items-center justify-between gap-4 px-4 py-4 md:h-20 md:flex-row md:px-8 md:py-0">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="gradient-blue glow-blue flex h-12 w-12 items-center justify-center rounded-xl shadow-lg md:h-14 md:w-14">
            <ImageIcon className="h-6 w-6 text-white md:h-8 md:w-8" />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-xl font-bold text-transparent md:text-2xl">
              DronCRoD
            </h1>
            <p className="text-xs text-blue-600/70">Sistema de Monitoreo</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
          <button
            onClick={() => onViewChange("monitor")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-300 md:px-6 md:py-3 md:text-sm ${
              currentView === "monitor"
                ? "gradient-blue glow-blue scale-105 text-white shadow-lg"
                : "bg-white/50 text-blue-600/70 shadow-sm hover:scale-105 hover:bg-white hover:text-blue-700"
            }`}
          >
            <Gauge className="h-4 w-4 md:h-5 md:w-5" />
            Monitoreo
          </button>
          <button
            onClick={() => onViewChange("video")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-300 md:px-6 md:py-3 md:text-sm ${
              currentView === "video"
                ? "gradient-blue glow-blue scale-105 text-white shadow-lg"
                : "bg-white/50 text-blue-600/70 shadow-sm hover:scale-105 hover:bg-white hover:text-blue-700"
            }`}
          >
            <Video className="h-4 w-4 md:h-5 md:w-5" />
            Video en Vivo
          </button>
          <button
            onClick={() => onViewChange("mission")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-300 md:px-6 md:py-3 md:text-sm ${
              currentView === "mission"
                ? "gradient-blue glow-blue scale-105 text-white shadow-lg"
                : "bg-white/50 text-blue-600/70 shadow-sm hover:scale-105 hover:bg-white hover:text-blue-700"
            }`}
          >
            <Map className="h-4 w-4 md:h-5 md:w-5" />
            Misión
          </button>
        </div>

        <div className="flex items-center gap-3 md:gap-6">
          <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-1.5 shadow-sm backdrop-blur-sm md:gap-3 md:px-4 md:py-2">
            <CloudSun className="h-4 w-4 text-blue-600 md:h-5 md:w-5" />
            <span className="text-sm font-semibold text-blue-700 md:text-base"></span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-1.5 font-mono shadow-sm backdrop-blur-sm md:gap-3 md:px-4 md:py-2">
            <Clock className="h-4 w-4 text-blue-600 md:h-5 md:w-5" />
            <span className="text-sm font-semibold text-blue-700 md:text-base">{time.toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
    </nav>
  )
}
