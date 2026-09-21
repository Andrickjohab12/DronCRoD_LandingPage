export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const upstream = await fetch("http://127.0.0.1:5000/api/status", {
      cache: "no-store",
          signal: AbortSignal.timeout(5000),
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json({ ok: false, ready: false }, { status: 502 })
  }
}
