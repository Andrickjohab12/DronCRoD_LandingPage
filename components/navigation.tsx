"use client"

import type { ViewType } from "@/components/drone-layout"
import { Clock, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { TelemetryState } from "@/components/useTelemetry"

interface NavigationProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  telemetry: TelemetryState
}

const TABS: { id: ViewType; label: string }[] = [
  { id: "monitor", label: "Monitoreo" },
  { id: "video", label: "Cámara" },
  { id: "mission", label: "Misión" },
]

export function Navigation({ currentView, onViewChange, telemetry }: NavigationProps) {
  const [time, setTime] = useState("")
  const [darkMode, setDarkMode] = useState(true)

  useEffect(() => {
    const format = () =>
      new Date().toLocaleTimeString("en-GB", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    setTime(format())
    const timer = setInterval(() => setTime(format()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("droncrod-theme")
    const dark = saved ? saved === "dark" : true
    document.documentElement.classList.toggle("dark", dark)
    setDarkMode(dark)
  }, [])

  const toggleTheme = () => {
    const dark = !darkMode
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("droncrod-theme", dark ? "dark" : "light")
    setDarkMode(dark)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-4 md:gap-6 md:px-6">
        <div className="flex min-w-[150px] shrink-0 items-center gap-3 sm:min-w-[180px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/brand-logo" alt="" className="h-8 w-8 rounded-full bg-white object-cover ring-1 ring-primary/30" />
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-bold tracking-[0.16em] text-primary">DRON-CRoD</span>
            <span className="hidden text-[10px] tracking-wide text-muted-foreground md:block">Club de Robótica</span>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onViewChange(tab.id)}
              className={cn(
                "relative px-3 py-2 text-[13px] tracking-wide transition-colors",
                currentView === tab.id ? "font-medium text-primary" : "text-muted-foreground hover:text-primary",
              )}
            >
              {tab.label}
              {currentView === tab.id && (
                <span className="absolute inset-x-2 -bottom-[13px] h-px bg-primary" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center justify-end gap-2 font-mono text-[12px] text-muted-foreground sm:min-w-[130px]">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-semibold tracking-wider lg:inline-flex ${
              telemetry.data.connection === "connected"
                ? "border-emerald-500/30 text-emerald-500"
                : "border-red-500/30 text-red-500"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                telemetry.data.connection === "connected" ? "bg-emerald-500" : "animate-pulse bg-red-500"
              }`}
            />
            {telemetry.data.connection === "connected" ? "MAVLINK" : "OFFLINE"}
          </span>
          <Clock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline" suppressHydrationWarning>{time || "--:--:--"}</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={darkMode ? "Activar interfaz clara" : "Activar interfaz oscura"}
            title={darkMode ? "Tema claro" : "Tema oscuro"}
            className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-accent"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  )
}
