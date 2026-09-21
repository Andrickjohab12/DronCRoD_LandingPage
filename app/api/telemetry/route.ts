import http from "http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function readTelemetry(): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get("http://127.0.0.1:8767/telemetry", { timeout: 1500 }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
      res.on("end", () => {
        resolve({
          status: res.statusCode || 200,
          body: Buffer.concat(chunks).toString("utf8"),
        })
      })
    })
    req.on("timeout", () => {
      req.destroy()
      reject(new Error("timeout"))
    })
    req.on("error", reject)
  })
}

export async function GET() {
  try {
    const { status, body } = await readTelemetry()
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    })
  } catch {
    return Response.json(
      { type: "snapshot", payload: { connection: "disconnected" } },
      { status: 200 },
    )
  }
}
