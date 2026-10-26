/**
 * El "slug" es la parte final del enlace del menú: /m/el-antojo
 */

/** "Café Ñandú & Co." → "cafe-nandu-co" */
export function slugify(text: string): string {
  const slug = String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : (slug + "-menu").replace(/^-/, "").slice(0, 40);
}

/** Entre 3 y 40 caracteres: letras minúsculas, números y guiones (no al inicio ni al final). */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug) && !slug.includes("--");
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);
