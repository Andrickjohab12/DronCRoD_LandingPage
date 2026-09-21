"use client"

import type { ViewType } from "@/components/drone-layout"
import { Camera, Clock, Gauge, Map, Menu, Moon, Sun, X } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { TelemetryState } from "@/components/useTelemetry"

interface NavigationProps {
  currentView: ViewType
  onViewChange: (view: ViewType) => void
  telemetry: TelemetryState
}

const TABS = [
  { id: "monitor", label: "Monitoreo", description: "Telemetría e instrumentos", icon: Gauge },
  { id: "video", label: "Cámara", description: "Reconocimiento en vivo", icon: Camera },
  { id: "mission", label: "Misión", description: "Mapa y navegación", icon: Map },
] satisfies { id: ViewType; label: string; description: string; icon: typeof Gauge }[]

export function Navigation({ currentView, onViewChange, telemetry }: NavigationProps) {
  const [time, setTime] = useState("")
  const [darkMode, setDarkMode] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

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

  const selectView = (view: ViewType) => {
    onViewChange(view)
    setMobileOpen(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-2 px-3 md:gap-6 md:px-6">
        <div className="flex shrink-0 items-center gap-2.5 sm:min-w-[180px] sm:gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/brand-logo" alt="" className="h-8 w-8 rounded-full bg-white object-cover ring-1 ring-primary/30" />
          <div className="min-w-0">
            <span className="block truncate text-[14px] font-bold tracking-[0.16em] text-primary">DRON-CRoD</span>
            <span className="hidden text-[10px] tracking-wide text-muted-foreground md:block">Club de Robótica</span>
          </div>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectView(tab.id)}
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
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir navegación"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/20 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 top-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Cerrar navegación"
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[82vw] max-w-xs flex-col border-r border-primary/20 bg-background shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/api/brand-logo" alt="" className="h-9 w-9 rounded-full bg-white object-cover ring-2 ring-primary/30" />
                <div>
                  <p className="text-sm font-bold tracking-[0.15em] text-primary">DRON-CRoD</p>
                  <p className="text-[10px] text-muted-foreground">Centro de operaciones</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar navegación"
                className="grid h-8 w-8 place-items-center rounded-full border border-border"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-2 p-3">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const active = currentView === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectView(tab.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                      active
                        ? "border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "border-transparent bg-muted/45 hover:border-primary/20 hover:bg-primary/8",
                    )}
                  >
                    <span className={cn("grid h-10 w-10 place-items-center rounded-lg", active ? "bg-white/15" : "bg-primary/10 text-primary")}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{tab.label}</span>
                      <span className={cn("block text-[11px]", active ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {tab.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </nav>

            <div className="border-t border-border p-4">
              <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                <span className="text-xs font-medium">Enlace MAVLink</span>
                <span className={cn("flex items-center gap-2 font-mono text-[10px]", telemetry.data.connection === "connected" ? "text-emerald-500" : "text-red-500")}>
                  <span className={cn("h-2 w-2 rounded-full", telemetry.data.connection === "connected" ? "bg-emerald-500" : "animate-pulse bg-red-500")} />
                  {telemetry.data.connection === "connected" ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </header>
  )
}
