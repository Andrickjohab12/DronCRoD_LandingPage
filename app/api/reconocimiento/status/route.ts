import { recognitionStatus } from "@/lib/reconocimiento-process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const result = await recognitionStatus()
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo consultar el reconocimiento"
    return Response.json({ ok: false, running: false, error: message }, { status: 500 })
  }
}
