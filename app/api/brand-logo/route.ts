import fs from "fs/promises"
import path from "path"

export const runtime = "nodejs"

export async function GET() {
  try {
    const logo = await fs.readFile(path.join(process.cwd(), "images", "logo-club.jfif"))
    return new Response(logo, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return new Response("Logo no encontrado", { status: 404 })
  }
}
