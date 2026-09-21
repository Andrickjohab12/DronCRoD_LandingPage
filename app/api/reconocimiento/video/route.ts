export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UPSTREAM = "http://127.0.0.1:5000/video_feed"

export async function GET() {
  try {
    const upstream = await fetch(UPSTREAM, { cache: "no-store" })
    if (!upstream.ok || !upstream.body) {
      return new Response("El stream de reconocimiento no está listo", { status: 502 })
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch {
    return new Response("No hay conexión con el motor de reconocimiento", { status: 502 })
  }
}
