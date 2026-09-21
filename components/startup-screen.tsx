"use client"

import { useEffect, useState } from "react"

export function StartupScreen() {
  const [visible, setVisible] = useState(true)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 1800)
    const hide = window.setTimeout(() => setVisible(false), 2350)
    return () => {
      window.clearTimeout(leave)
      window.clearTimeout(hide)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[#050b18] transition-all duration-500 ${
        leaving ? "pointer-events-none scale-[1.03] opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.25),transparent_46%)]" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
      <div className="relative flex flex-col items-center text-center">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full border border-blue-400/15" />
          <div className="absolute -inset-3 animate-pulse rounded-full border border-blue-400/30" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/api/brand-logo"
            alt="Logo del Club de Robótica"
            className="h-28 w-28 rounded-full bg-white object-cover shadow-[0_0_50px_rgba(37,99,235,0.35)]"
          />
        </div>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.38em] text-blue-300">
          Sistema operativo
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white">Dron-CRoD</h1>
        <div className="mt-6 h-0.5 w-44 overflow-hidden bg-white/10">
          <div className="h-full origin-left animate-[startup_1.7s_ease-out_forwards] bg-blue-500" />
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
          Inicializando telemetría · IA · navegación
        </p>
      </div>
    </div>
  )
}
