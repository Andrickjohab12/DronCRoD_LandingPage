export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const refresh = url.searchParams.get("refresh") || "0"
  try {
    const upstream = await fetch(`http://127.0.0.1:5000/api/cameras?refresh=${refresh}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json({ cameras: [] }, { status: 502 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const upstream = await fetch("http://127.0.0.1:5000/api/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(45000),
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json({ ok: false, message: "No se pudo cambiar de cámara" }, { status: 502 })
  }
}
