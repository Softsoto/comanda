import { getImage } from "@/lib/data";
import { isUuid } from "@/lib/slug";

/** Sirve las fotos guardadas en la base de datos (logos y productos). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const image = isUuid(id) ? await getImage(id) : null;
  if (!image) return new Response("Imagen no encontrada", { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      // Cada imagen nueva tiene un id distinto, así que el navegador puede guardarla sin volver a pedirla.
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
