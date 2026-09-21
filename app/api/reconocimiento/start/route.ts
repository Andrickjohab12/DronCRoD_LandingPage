import { startRecognition } from "@/lib/reconocimiento-process"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    const result = await startRecognition()
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar el reconocimiento"
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
