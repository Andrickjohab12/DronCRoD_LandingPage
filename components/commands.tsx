"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import {
  Shield, ShieldOff, PlaneTakeoff, PlaneLanding,
  Home, Pause, ChevronUp, ChevronDown,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
  Radio, Zap, Navigation, RefreshCw, Cpu,
} from "lucide-react"
import { useTelemetry } from "./useTelemetry"

type DialogType = "arm" | "disarm" | "takeoff" | "land" | "rtl" | null

const FLIGHT_MODES = [
  { name: "STABILIZE", label: "Estabilizado",  desc: "Control manual básico" },
  { name: "ALT_HOLD",  label: "Alt. Fija",     desc: "Mantiene altitud automática" },
  { name: "LOITER",    label: "Loiter",         desc: "Mantiene posición GPS" },
  { name: "GUIDED",    label: "Guiado",         desc: "Control por comandos externos" },
  { name: "AUTO",      label: "Automático",     desc: "Sigue misión programada" },
  { name: "CIRCLE",    label: "Órbita",         desc: "Orbita el punto actual" },
  { name: "RTL",       label: "RTL",            desc: "Regresa al punto de despegue" },
  { name: "LAND",      label: "Aterrizar",      desc: "Aterrizaje en sitio actual" },
  { name: "POSHOLD",   label: "Pos. Hold",      desc: "GPS + altitud fija" },
  { name: "DRIFT",     label: "Drift",          desc: "Vuelo suave tipo avión" },
]

export function Commands() {
  const { data: stats, lastAck, sendCommand } = useTelemetry()

  const [dialog, setDialog]         = useState<DialogType>(null)
  const [takeoffAlt, setTakeoffAlt] = useState(5)
  const [pendingCmd, setPendingCmd] = useState<string | null>(null)
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    if (!lastAck) return
    setToast({ msg: lastAck.message, ok: lastAck.success })
    setPendingCmd(null)
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [lastAck])

  const dispatch = (command: string, args: Record<string, unknown> = {}) => {
    setPendingCmd(command)
    setDialog(null)
    sendCommand(command, args)
    setTimeout(() => setPendingCmd(null), 8000)
  }

  const isConnected = stats.connection === "connected"
  const isArmed     = stats.armed

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 p-4 md:space-y-6 md:p-8">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-blue-50 via-blue-100/50 to-white p-4 shadow-lg md:flex-row md:items-center md:justify-between md:p-6">
        <div>
          <h2 className="bg-gradient-to-r from-blue-700 to-blue-500 bg-clip-text text-2xl font-bold text-transparent md:text-3xl">
            Panel de Comandos
          </h2>
          <p className="mt-2 text-sm text-blue-600/70">Control en tiempo real del dron vía MAVLink</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-2 shadow-md md:px-6 md:py-3">
          <div className={`h-4 w-4 rounded-full animate-pulse ${
            isArmed ? "bg-blue-600 shadow-lg shadow-blue-500/50" : "bg-gray-400"
          }`} />
          <span className="font-mono text-base font-bold text-blue-700 md:text-lg">
            {isArmed ? "ARMADO" : "DESARMADO"} — {isConnected ? stats.flight_mode : "DESCONECTADO"}
          </span>
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-mono shadow-sm
          ${toast.ok
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-red-200 bg-red-50 text-red-600"}`}>
          {toast.ok
            ? <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-500" />
            : <XCircle className="h-4 w-4 shrink-0 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* ── Advertencia desconectado ───────────────────────────────────────── */}
      {!isConnected && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700 shadow-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Dron desconectado — los comandos no serán enviados hasta restablecer la conexión.
        </div>
      )}

      {/* ── Cards de estado ───────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-4">
        <Card className="group relative overflow-hidden border-0 bg-blue-600 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Batería</p>
              <p className="font-mono text-4xl font-bold text-white md:text-5xl">
                {stats.battery.toFixed(0)}%
              </p>
            </div>
            <Zap className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-500 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Voltaje</p>
              <p className="font-mono text-4xl font-bold text-white md:text-5xl">
                {stats.voltage.toFixed(1)}<span className="text-2xl">V</span>
              </p>
            </div>
            <Zap className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-700 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Heading</p>
              <p className="font-mono text-4xl font-bold text-white md:text-5xl">
                {stats.heading.toFixed(0)}°
              </p>
            </div>
            <Navigation className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>

        <Card className="group relative overflow-hidden border-0 bg-blue-400 p-6 shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl md:p-8">
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100">Corriente</p>
              <p className="font-mono text-4xl font-bold text-white md:text-5xl">
                {stats.current.toFixed(1)}<span className="text-2xl">A</span>
              </p>
            </div>
            <Radio className="h-12 w-12 text-white/80 md:h-16 md:w-16" />
          </div>
        </Card>
      </div>

      {/* ── Comandos de vuelo ─────────────────────────────────────────────── */}
      <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3">
            <Zap className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-foreground md:text-lg">Comandos de Vuelo</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">

          <FlightBtn
            icon={<Shield className="h-6 w-6" />}
            label="Armar"
            sublabel="Activa motores"
            active={isArmed}
            variant="green"
            disabled={!isConnected || isArmed}
            loading={pendingCmd === "arm"}
            onClick={() => setDialog("arm")}
          />
          <FlightBtn
            icon={<ShieldOff className="h-6 w-6" />}
            label="Desarmar"
            sublabel="Detiene motores"
            active={false}
            variant="red"
            disabled={!isConnected || !isArmed}
            loading={pendingCmd === "disarm"}
            onClick={() => setDialog("disarm")}
          />
          <FlightBtn
            icon={<PlaneTakeoff className="h-6 w-6" />}
            label="Despegar"
            sublabel={`Objetivo: ${takeoffAlt}m`}
            active={false}
            variant="blue"
            disabled={!isConnected}
            loading={pendingCmd === "takeoff"}
            onClick={() => setDialog("takeoff")}
          />
          <FlightBtn
            icon={<PlaneLanding className="h-6 w-6" />}
            label="Aterrizar"
            sublabel="En posición actual"
            active={false}
            variant="indigo"
            disabled={!isConnected}
            loading={pendingCmd === "land"}
            onClick={() => setDialog("land")}
          />
          <FlightBtn
            icon={<Home className="h-6 w-6" />}
            label="RTL"
            sublabel="Volver a casa"
            active={false}
            variant="sky"
            disabled={!isConnected}
            loading={pendingCmd === "rtl"}
            onClick={() => setDialog("rtl")}
          />
          <FlightBtn
            icon={<Pause className="h-6 w-6" />}
            label="Hold"
            sublabel="Mantener posición"
            active={false}
            variant="cyan"
            disabled={!isConnected}
            loading={pendingCmd === "hold"}
            onClick={() => dispatch("hold")}
          />
        </div>
      </Card>

      {/* ── Altitud + Misiones ────────────────────────────────────────────── */}
      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">

        {/* Ajuste de altitud */}
        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <ChevronUp className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">
              Ajuste de Altitud
              <span className="ml-2 font-mono text-sm font-normal text-blue-600">
                actual: {stats.altitude.toFixed(1)} m
              </span>
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[2, 5, 10, 20].map(m => (
              <button
                key={`up-${m}`}
                disabled={!isConnected || pendingCmd !== null}
                onClick={() => dispatch("change_altitude", { delta: m })}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-50 to-transparent
                  border border-blue-100 px-4 py-3 font-mono text-sm font-bold text-blue-600
                  transition-all hover:border-blue-300 hover:bg-blue-100
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronUp className="h-4 w-4" /> +{m} m
              </button>
            ))}
            {[2, 5, 10, 20].map(m => (
              <button
                key={`down-${m}`}
                disabled={!isConnected || pendingCmd !== null}
                onClick={() => dispatch("change_altitude", { delta: -m })}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-50 to-transparent
                  border border-blue-100 px-4 py-3 font-mono text-sm font-bold text-blue-500
                  transition-all hover:border-blue-300 hover:bg-blue-100
                  disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4" /> -{m} m
              </button>
            ))}
          </div>
        </Card>

        {/* Misiones rápidas */}
        <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3">
              <Navigation className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="text-base font-bold text-foreground md:text-lg">Misiones Rápidas</h3>
          </div>
          <div className="space-y-3">
            <MissionBtn
              label="Despegue de reconocimiento"
              desc="Sube a 15m y activa Loiter"
              disabled={!isConnected || pendingCmd !== null}
              onClick={() => { dispatch("takeoff", { altitude: 15 }); setTimeout(() => dispatch("hold"), 5000) }}
            />
            <MissionBtn
              label="Órbita del área"
              desc="Activa modo Circle en posición actual"
              disabled={!isConnected || pendingCmd !== null}
              onClick={() => dispatch("circle")}
            />
            <MissionBtn
              label="Posición de inspección"
              desc="Sube a 10m y mantiene posición"
              disabled={!isConnected || pendingCmd !== null}
              onClick={() => { dispatch("takeoff", { altitude: 10 }); setTimeout(() => dispatch("hold"), 5000) }}
            />
            <MissionBtn
              label="Regreso seguro"
              desc="RTL + aterrizaje automático"
              disabled={!isConnected || pendingCmd !== null}
              onClick={() => dispatch("rtl")}
              danger
            />
          </div>
        </Card>
      </div>

      {/* ── Selector de modo ──────────────────────────────────────────────── */}
      <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3">
            <Radio className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-foreground md:text-lg">Modo de Vuelo</h3>
          <span className="ml-auto rounded-xl bg-blue-600 px-3 py-1.5 font-mono text-xs font-bold text-white shadow-md">
            ACTUAL: {stats.flight_mode}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {FLIGHT_MODES.map(mode => {
            const active = stats.flight_mode === mode.name
            return (
              <button
                key={mode.name}
                disabled={!isConnected || pendingCmd !== null}
                onClick={() => dispatch("set_mode", { mode: mode.name })}
                title={mode.desc}
                className={`relative rounded-xl border p-3 text-left transition-all duration-200
                  disabled:cursor-not-allowed disabled:opacity-40
                  ${active
                    ? "border-blue-400 bg-gradient-to-r from-blue-600 to-blue-500 shadow-lg shadow-blue-200"
                    : "border-blue-100 bg-gradient-to-r from-blue-50 to-transparent hover:border-blue-300 hover:from-blue-100"
                  }`}
              >
                <p className={`font-mono text-sm font-bold ${active ? "text-white" : "text-blue-700"}`}>
                  {mode.label}
                </p>
                <p className={`mt-0.5 text-[10px] leading-tight ${active ? "text-blue-100" : "text-blue-500/70"}`}>
                  {mode.desc}
                </p>
                {active && (
                  <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                )}
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── Sistema técnico ───────────────────────────────────────────────── */}
      <Card className="border-0 bg-white p-6 shadow-xl md:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-3">
            <Cpu className="h-6 w-6 text-blue-600" />
          </div>
          <h3 className="text-base font-bold text-foreground md:text-lg">Estado del Sistema</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Estado",    value: isArmed ? "ARMADO" : "DESARMADO" },
            { label: "Modo",      value: stats.flight_mode },
            { label: "Altitud",   value: `${stats.altitude.toFixed(2)} m` },
            { label: "Velocidad", value: `${stats.speed.toFixed(2)} m/s` },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between rounded-xl bg-gradient-to-r from-blue-50 to-transparent p-3 md:p-4">
              <span className="text-sm font-semibold text-foreground">{label}</span>
              <span className="font-mono text-sm font-bold text-blue-600">{value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Diálogo de confirmación ───────────────────────────────────────── */}
      {dialog && (
        <ConfirmDialog
          type={dialog}
          takeoffAlt={takeoffAlt}
          onChangeAlt={setTakeoffAlt}
          onConfirm={() => {
            if (dialog === "arm")     dispatch("arm")
            if (dialog === "disarm")  dispatch("disarm")
            if (dialog === "takeoff") dispatch("takeoff", { altitude: takeoffAlt })
            if (dialog === "land")    dispatch("land")
            if (dialog === "rtl")     dispatch("rtl")
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const variantClasses: Record<string, string> = {
  green:  "border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300",
  red:    "border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300",
  blue:   "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300",
  sky:    "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 hover:border-sky-300",
  cyan:   "border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300",
}

function FlightBtn({ icon, label, sublabel, variant, disabled, loading, onClick }: {
  icon: React.ReactNode; label: string; sublabel: string
  variant: string; active: boolean; disabled: boolean; loading: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 transition-all duration-200
        disabled:cursor-not-allowed disabled:opacity-40
        ${variantClasses[variant]}`}
    >
      {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      <span className="font-mono text-sm font-bold">{label}</span>
      <span className="text-center text-[10px] text-blue-500/70 leading-tight">{sublabel}</span>
    </button>
  )
}

function MissionBtn({ label, desc, disabled, onClick, danger }: {
  label: string; desc: string; disabled: boolean; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition-all
        disabled:cursor-not-allowed disabled:opacity-40 md:p-4
        ${danger
          ? "border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-300"
          : "border-blue-100 bg-gradient-to-r from-blue-50 to-transparent hover:from-blue-100 hover:border-blue-300"
        }`}
    >
      <div>
        <p className={`text-sm font-bold ${danger ? "text-red-600" : "text-blue-700"}`}>{label}</p>
        <p className="text-xs text-blue-500/70">{desc}</p>
      </div>
      <RefreshCw className={`h-4 w-4 shrink-0 ${danger ? "text-red-400" : "text-blue-400"}`} />
    </button>
  )
}

function ConfirmDialog({ type, takeoffAlt, onChangeAlt, onConfirm, onCancel }: {
  type: DialogType; takeoffAlt: number
  onChangeAlt: (v: number) => void
  onConfirm: () => void; onCancel: () => void
}) {
  const configs: Record<NonNullable<DialogType>, {
    title: string; desc: string; confirmLabel: string
    confirmClass: string; icon: React.ReactNode
  }> = {
    arm: {
      title: "¿Armar motores?",
      desc: "Los motores se activarán. Asegúrate de que el área esté despejada y nadie esté cerca de las hélices.",
      confirmLabel: "Sí, armar",
      confirmClass: "bg-green-600 hover:bg-green-500 text-white",
      icon: <Shield className="h-8 w-8 text-green-500" />,
    },
    disarm: {
      title: "¿Desarmar motores?",
      desc: "Los motores se detendrán. Solo realiza esto si el dron está en tierra.",
      confirmLabel: "Sí, desarmar",
      confirmClass: "bg-red-600 hover:bg-red-500 text-white",
      icon: <ShieldOff className="h-8 w-8 text-red-500" />,
    },
    takeoff: {
      title: "Configurar Despegue",
      desc: "El dron cambiará a modo GUIDED, se armará y despegará a la altitud seleccionada.",
      confirmLabel: "Despegar",
      confirmClass: "gradient-blue text-white",
      icon: <PlaneTakeoff className="h-8 w-8 text-blue-600" />,
    },
    land: {
      title: "¿Iniciar aterrizaje?",
      desc: "El dron descenderá y aterrizará en su posición actual. No lo muevas durante el proceso.",
      confirmLabel: "Sí, aterrizar",
      confirmClass: "bg-indigo-600 hover:bg-indigo-500 text-white",
      icon: <PlaneLanding className="h-8 w-8 text-indigo-500" />,
    },
    rtl: {
      title: "¿Activar RTL?",
      desc: "El dron subirá a la altitud de seguridad configurada y volverá al punto de despegue automáticamente.",
      confirmLabel: "Sí, regresar",
      confirmClass: "bg-sky-600 hover:bg-sky-500 text-white",
      icon: <Home className="h-8 w-8 text-sky-500" />,
    },
  }

  if (!type) return null
  const c = configs[type]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-4">
          {c.icon}
          <h3 className="text-xl font-bold text-foreground">{c.title}</h3>
        </div>
        <p className="mb-5 text-sm leading-relaxed text-blue-600/70">{c.desc}</p>

        {type === "takeoff" && (
          <div className="mb-5 space-y-3 rounded-xl bg-blue-50 p-4">
            <label className="text-sm font-semibold text-blue-700">
              Altitud objetivo: <span className="font-mono font-bold">{takeoffAlt} m</span>
            </label>
            <input
              type="range" min={2} max={50} step={1} value={takeoffAlt}
              onChange={e => onChangeAlt(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between font-mono text-xs text-blue-500">
              <span>2m</span><span>25m</span><span>50m</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map(v => (
                <button
                  key={v}
                  onClick={() => onChangeAlt(v)}
                  className={`rounded-lg border px-2 py-1.5 font-mono text-xs font-bold transition-all
                    ${takeoffAlt === v
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-blue-200 text-blue-600 hover:border-blue-400 hover:bg-blue-100"}`}
                >
                  {v}m
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold
              text-blue-600 transition-all hover:bg-blue-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition-all shadow-md ${c.confirmClass}`}
          >
            {c.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}