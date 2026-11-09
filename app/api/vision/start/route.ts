import { spawn, type ChildProcess } from "node:child_process"
import net from "node:net"
import path from "node:path"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

declare global {
  // eslint-disable-next-line no-var
  var droncrodVisionProcess: ChildProcess | undefined
  // eslint-disable-next-line no-var
  var droncrodVisionOutput: string | undefined
}

const HOST = "127.0.0.1"
const PORT = 8769

function serviceIsListening() {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host: HOST, port: PORT })
    const finish = (isOpen: boolean) => { socket.destroy(); resolve(isOpen) }
    socket.setTimeout(500)
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
    socket.once("timeout", () => finish(false))
  })
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function launchPythonService() {
  const isWindows = process.platform === "win32"
  const launcher = isWindows ? "powershell.exe" : (process.env.PYTHON_EXECUTABLE || "python3")
  const script = path.join(process.cwd(), "vision", isWindows ? "run-vision.ps1" : "object_detection_server.py")
  const args = isWindows
    ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script]
    : ["-u", script]
  const child = spawn(launcher, args, {
    cwd: process.cwd(),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  globalThis.droncrodVisionProcess = child
  globalThis.droncrodVisionOutput = ""
  const collect = (chunk: Buffer) => {
    globalThis.droncrodVisionOutput = `${globalThis.droncrodVisionOutput || ""}${chunk.toString()}`.slice(-3000)
  }
  child.stdout?.on("data", collect)
  child.stderr?.on("data", collect)
  child.on("error", (error) => { globalThis.droncrodVisionOutput = error.message })
  child.on("exit", (code) => {
    if (code && code !== 0 && !globalThis.droncrodVisionOutput) {
      globalThis.droncrodVisionOutput = `El servicio Python terminó con código ${code}.`
    }
  })
  return child
}

export async function POST() {
  if (await serviceIsListening()) return NextResponse.json({ started: true, alreadyRunning: true })

  const previous = globalThis.droncrodVisionProcess
  if (previous && previous.exitCode === null) {
    // Clear a process left waiting by the previous eager PyTorch import path.
    if (process.platform === "win32" && previous.pid) {
      const killer = spawn("taskkill.exe", ["/PID", String(previous.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      killer.unref()
    } else {
      previous.kill()
    }
    await delay(300)
  }
  const child = launchPythonService()

  // Heavy ML imports now happen after the Python process binds this port.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await serviceIsListening()) return NextResponse.json({ started: true, alreadyRunning: false })
    if (child.exitCode !== null) break
    await delay(250)
  }

  const details = (globalThis.droncrodVisionOutput || "").trim() || "Python no abrió el puerto 8769 dentro del tiempo esperado."
  const dependencyHint = /No module named|ModuleNotFoundError|Faltan paquetes|pip|python is not recognized|ENOENT/i.test(details)
  return NextResponse.json({
    started: false,
    error: dependencyHint
      ? `Python encontró un problema con su configuración o sus paquetes: ${details}`
      : `El servicio Python no abrió el puerto 8769. ${details}`,
  }, { status: 503 })
}
