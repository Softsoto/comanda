/**
 * Códigos de los juegos escondidos: el administrador los inventa en el panel
 * de diseño (Administración → Juegos → Códigos) y los reparte; quien los
 * escribe en la consola del juego ve un anuncio, como los mensajes secretos.
 *
 * Los códigos NO van en la personalización pública (cualquiera podría leerlos):
 * se guardan aparte y el servidor solo dice si un código escrito es válido.
 * Este archivo no toca la base de datos: lo usan el servidor y el panel.
 */

export type GameCode = {
  /** Lo que hay que escribir (se compara sin importar mayúsculas, tildes, espacios ni guiones). */
  code: string;
  /** El título del anuncio. */
  title: string;
  /** Los párrafos del anuncio. */
  text: string[];
  /** Si está apagado, el código no funciona (pero se conserva). */
  active: boolean;
};

export const CODE_LIMITS = { code: 24, codeMin: 3, title: 60, paragraph: 400, paragraphs: 5, count: 50 } as const;

/** Cómo se comparan los códigos: mayúsculas, sin tildes, solo letras, números y guiones. */
export function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/Ñ/g, "N")
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, CODE_LIMITS.code);
}

/**
 * La forma con la que se comparan dos códigos: como normalizeCode, pero sin
 * guiones, para que "PRUEBA-2026", "prueba 2026" y "prueba2026" sean el mismo.
 */
export const codeKey = (value: unknown) => normalizeCode(value).replace(/-/g, "");

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Deja solo códigos válidos (con código, título y al menos un párrafo), sin repetir el mismo código. */
export function cleanCodes(value: unknown): GameCode[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: GameCode[] = [];
  for (const item of value) {
    const raw = (item ?? {}) as Record<string, unknown>;
    const code = normalizeCode(raw.code);
    const title = clip(raw.title, CODE_LIMITS.title);
    const text = (Array.isArray(raw.text) ? raw.text : [raw.text])
      .map((line) => clip(line, CODE_LIMITS.paragraph))
      .filter(Boolean)
      .slice(0, CODE_LIMITS.paragraphs);
    if (codeKey(code).length < CODE_LIMITS.codeMin || !title || text.length === 0 || seen.has(codeKey(code))) continue;
    seen.add(codeKey(code));
    list.push({ code, title, text, active: raw.active !== false });
    if (list.length >= CODE_LIMITS.count) break;
  }
  return list;
}

/** Busca un código activo. */
export const findCode = (codes: readonly GameCode[], typed: unknown) => {
  const wanted = codeKey(typed);
  return wanted ? codes.find((item) => item.active && codeKey(item.code) === wanted) : undefined;
};

/** Un código de ejemplo, para que el panel no empiece vacío. */
export const EXAMPLE_CODES: GameCode[] = [
  {
    code: "DOSLUNAS",
    title: "Código de bienvenida",
    text: ["¡Encontraste la consola! Aquí puedes escribir los códigos que te vayan dando.", "Cada código guarda un anuncio distinto."],
    active: true,
  },
];
