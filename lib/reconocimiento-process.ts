import { spawn } from "child_process"
import fs from "fs"
import path from "path"

const STREAM_ORIGIN = "http://127.0.0.1:5000"
const ROOT = path.join(process.cwd(), "Reconocimiento")
const RUNTIME_DIR = path.join(ROOT, ".runtime")
const PID_FILE = path.join(RUNTIME_DIR, "server.pid")
const LOG_FILE = path.join(ROOT, "logs", "stream.log")

function pythonBin() {
  const venvWin = path.join(ROOT, ".venv", "Scripts", "python.exe")
  const venvUnix = path.join(ROOT, ".venv", "bin", "python")
  if (fs.existsSync(venvWin)) return venvWin
  if (fs.existsSync(venvUnix)) return venvUnix
  return process.platform === "win32" ? "python" : "python3"
}

export async function isStreamHealthy(timeoutMs = 800) {
  try {
    const res = await fetch(`${STREAM_ORIGIN}/api/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
    return res.ok
  } catch {
    return false
  }
}

function readPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf8").trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

function writePid(pid: number) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  fs.writeFileSync(PID_FILE, String(pid), "utf8")
}

function clearPid() {
  try {
    fs.unlinkSync(PID_FILE)
  } catch {
    /* ignore */
  }
}

export async function startRecognition() {
  if (await isStreamHealthy(1200)) {
    return { ok: true, alreadyRunning: true as const }
  }

  if (!fs.existsSync(path.join(ROOT, "main.py"))) {
    throw new Error("No se encontró Reconocimiento/main.py")
  }

  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  fs.mkdirSync(RUNTIME_DIR, { recursive: true })
  const log = fs.openSync(LOG_FILE, "a")
  const child = spawn(
    pythonBin(),
    ["main.py", "--headless", "--stream-port", "5000", "--source", "laptop"],
    {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", log, log],
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: "1" },
    },
  )
  child.unref()
  if (!child.pid) {
    fs.closeSync(log)
    throw new Error("No se pudo iniciar Python")
  }
  writePid(child.pid)
  return { ok: true, alreadyRunning: false as const, pid: child.pid }
}

function killPid(pid: number) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    })
    return
  }
  try {
    process.kill(pid, "SIGTERM")
  } catch {
    /* ignore */
  }
}

export async function stopRecognition() {
  try {
    await fetch(`${STREAM_ORIGIN}/api/shutdown`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    })
  } catch {
    /* process may already be down */
  }

  const pid = readPid()
  if (pid) {
    killPid(pid)
    clearPid()
  }

  return { ok: true }
}

export async function recognitionStatus() {
  const healthy = await isStreamHealthy(800)
  return {
    ok: true,
    running: healthy,
    pid: readPid(),
  }
}
