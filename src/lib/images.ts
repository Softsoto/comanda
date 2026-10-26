import { LIMITS } from "./config";

export type ImageUpload =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "image"; mime: string; bytes: Buffer };

/** Reconoce el formato por los primeros bytes del archivo, no por su nombre. */
function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Valida una imagen subida desde un formulario.
 * El navegador ya la redujo antes de enviarla; aquí se comprueba que de
 * verdad sea JPG, PNG o WebP y que no pese más de lo permitido.
 */
export async function readImageUpload(value: FormDataEntryValue | null): Promise<ImageUpload> {
  if (!value || typeof value === "string" || value.size === 0) return { kind: "none" };
  if (value.size > LIMITS.maxImageBytes) {
    return { kind: "error", message: "La imagen pesa demasiado. Usa una de menos de 2 MB." };
  }
  const bytes = Buffer.from(await value.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { kind: "error", message: "Usa una imagen JPG, PNG o WebP." };
  return { kind: "image", mime, bytes };
}
