export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const upstream = await fetch("http://127.0.0.1:5000/api/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(45000),
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json({ ok: false, message: "No hay conexión con el motor de reconocimiento" }, { status: 502 })
  }
}
