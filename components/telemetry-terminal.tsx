"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import type { TelemetryLog, TelemetryState } from "./useTelemetry"

function logColor(level: string) {
  if (level === "ok") return "text-emerald-400"
  if (level === "warn") return "text-amber-300"
  if (level === "err") return "text-red-400"
  return "text-zinc-300"
}

function stamp(t: number) {
  const d = new Date(t * 1000)
  return d.toLocaleTimeString()
}

const QUICK = [
  { cmd: "streams", label: "Streams" },
  { cmd: "version", label: "Versión" },
  { cmd: "posctl", label: "POSCTL" },
  { cmd: "loiter", label: "Loiter" },
  { cmd: "rtl", label: "RTL" },
  { cmd: "land", label: "Land" },
]

export function TelemetryTerminal({ telemetry }: { telemetry: TelemetryState }) {
  const { data, sendCommand, wsState } = telemetry
  const [input, setInput] = useState("")
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [data.logs.length])

  const run = (cmd: string, extra?: Record<string, string>) => {
    if (!sendCommand(cmd, extra)) {
      setInput("")
      return
    }
    setInput("")
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const raw = input.trim()
    if (!raw) return
    const [head, ...rest] = raw.split(/\s+/)
    const cmd = head.toLowerCase()
    if (cmd === "mode" && rest[0]) run("mode", { mode: rest[0].toUpperCase() })
    else run(cmd)
  }

  return (
    <div className="flex h-full min-h-[320px] flex-col overflow-hidden bg-[#0c0b0a] text-xs">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 font-mono text-[11px] text-zinc-500">
        <span>MAVLink · {data.port || "sin puerto"} · sys {data.sysid}:{data.compid}</span>
        <span className={wsState === "open" ? "text-emerald-400" : "text-amber-300"}>
          WS {wsState === "open" ? "open" : "reconectando"}
        </span>
      </div>
      <div ref={scroller} className="flex-1 space-y-0.5 overflow-y-auto px-4 py-3 font-mono">
        {data.logs.length === 0 && <p className="text-zinc-600">Esperando mensajes del SiK / PX4…</p>}
        {data.logs.map((line: TelemetryLog, i: number) => (
          <p key={`${line.t}-${i}`} className={logColor(line.level)}>
            <span className="mr-2 text-zinc-600">{stamp(line.t)}</span>
            {line.text}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-white/10 px-3 py-2">
        {QUICK.map((item) => (
          <button
            key={item.cmd}
            type="button"
            onClick={() => run(item.cmd)}
            className="border border-white/10 bg-transparent px-2 py-1 font-mono text-[10px] text-zinc-300 hover:bg-white/10"
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => window.confirm("¿ARMAR motores?") && run("arm")}
          className="border border-emerald-700/70 px-2 py-1 font-mono text-[10px] text-emerald-300 hover:bg-emerald-900/40"
        >
          ARM
        </button>
        <button
          type="button"
          onClick={() => run("disarm")}
          className="border border-red-800/70 px-2 py-1 font-mono text-[10px] text-red-300 hover:bg-red-950/50"
        >
          DISARM
        </button>
      </div>
      <form onSubmit={onSubmit} className="flex border-t border-white/10">
        <span className="px-3 py-2 font-mono text-emerald-400">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="arm · disarm · rtl · land · loiter · posctl · streams · version · mode POSCTL"
          className="flex-1 bg-transparent px-1 py-2 font-mono text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </form>
    </div>
  )
}
