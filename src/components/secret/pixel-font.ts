/**
 * Letras de píxeles del juego escondido, dibujadas a mano.
 *
 * Cada letra mide 7 píxeles de alto y, casi todas, 5 de ancho ("#" es un píxel
 * encendido). Solo hay mayúsculas, como en las máquinas de antes. Las tildes,
 * la diéresis y la virgulilla de la Ñ van en dos filas extra por encima.
 */

export const GLYPH_ROWS = 7;
export const ACCENT_ROWS = 2;
/** Píxeles en blanco entre una letra y la siguiente. */
export const LETTER_GAP = 1;

const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["###", ".#.", ".#.", ".#.", ".#.", ".#.", "###"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],

  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": [".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", "..#..", "..#..", "..#.."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "....#", ".###."],

  " ": ["...", "...", "...", "...", "...", "...", "..."],
  ".": ["..", "..", "..", "..", "..", "##", "##"],
  ",": ["..", "..", "..", "..", ".#", ".#", "#."],
  ":": ["..", "##", "##", "..", "##", "##", ".."],
  ";": ["..", "##", "##", "..", ".#", ".#", "#."],
  "!": ["#", "#", "#", "#", "#", ".", "#"],
  "¡": ["#", ".", "#", "#", "#", "#", "#"],
  "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
  "¿": ["..#..", ".....", "..#..", ".#...", "#....", "#...#", ".###."],
  "@": [".#####.", "#.....#", "#.###.#", "#.#.#.#", "#.####.", "#......", ".#####."],
  "-": ["....", "....", "....", "####", "....", "....", "...."],
  "—": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  _: [".....", ".....", ".....", ".....", ".....", ".....", "#####"],
  "·": ["..", "..", "..", "##", "##", "..", ".."],
  "'": ["#", "#", ".", ".", ".", ".", "."],
  '"': ["#.#", "#.#", "...", "...", "...", "...", "..."],
  "(": ["..#", ".#.", "#..", "#..", "#..", ".#.", "..#"],
  ")": ["#..", ".#.", "..#", "..#", "..#", ".#.", "#.."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "#": [".#.#.", ".#.#.", "#####", ".#.#.", "#####", ".#.#.", ".#.#."],
  "%": ["##..#", "##.#.", "...#.", "..#..", ".#...", ".#.##", "#..##"],
  "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
  "…": [".....", ".....", ".....", ".....", ".....", ".....", "#.#.#"],
  "♥": [".##.##.", "#######", "#######", "#######", ".#####.", "..###..", "...#..."],
  "←": [".....", "..#..", ".#...", "#####", ".#...", "..#..", "....."],
  "→": [".....", "..#..", "...#.", "#####", "...#.", "..#..", "....."],
  "↑": ["..#..", ".###.", "#.#.#", "..#..", "..#..", "..#..", "....."],
  "↓": [".....", "..#..", "..#..", "..#..", "#.#.#", ".###.", "..#.."],

  // Dibujos para los botones: pausa, seguir, cerrar, sonido, girar, soltar y estrella.
  "‖": ["##.##", "##.##", "##.##", "##.##", "##.##", "##.##", "##.##"],
  "▶": ["#....", "##...", "###..", "####.", "###..", "##...", "#...."],
  "×": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  "♫": ["..#####", "..#...#", "..#...#", "..#...#", ".##..##", "###.###", "##..##."],
  "↻": ["..####...", ".#....#..", "#...#####", "#....###.", "#.....#..", ".#.......", "..####..."],
  "⤓": ["..#..", "..#..", "#.#.#", ".###.", "..#..", ".....", "#####"],
  "★": ["...#...", "...#...", "#######", ".#####.", "..###..", ".##.##.", ".#...#."],
};

/** Marcas que van encima de una letra, en dos filas. */
const ACCENTS = {
  acute: ["...#.", "..#.."],
  narrowAcute: ["..#", ".#."],
  dieresis: [".#.#.", "....."],
  tilde: [".##.#", "#.##."],
} as const;

const ACCENTED: Record<string, [base: string, accent: keyof typeof ACCENTS]> = {
  Á: ["A", "acute"],
  É: ["E", "acute"],
  Í: ["I", "narrowAcute"],
  Ó: ["O", "acute"],
  Ú: ["U", "acute"],
  Ü: ["U", "dieresis"],
  Ñ: ["N", "tilde"],
};

/** Caracteres que se escriben distinto pero se dibujan con una letra que ya existe. */
const ALIASES: Record<string, string> = { "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", " ": " ", "•": "·" };

export type Glyph = {
  width: number;
  /** Las 7 filas de la letra. */
  rows: readonly string[];
  /** Las 2 filas de la tilde, si la lleva. */
  accent: readonly string[] | null;
};

/** Pasa el texto a lo que la tipografía sabe dibujar: mayúsculas y signos conocidos. */
export function normalizeText(text: string): string {
  return [...text.toUpperCase()].map((char) => ALIASES[char] ?? char).join("");
}

/** La letra de un carácter (ya normalizado), o null si la tipografía no lo tiene. */
export function glyphFor(char: string): Glyph | null {
  const accented = ACCENTED[char];
  const rows = GLYPHS[accented ? accented[0] : char];
  if (!rows) return null;
  return { width: rows[0].length, rows, accent: accented ? ACCENTS[accented[1]] : null };
}

/** Caracteres de un texto que la tipografía no sabe dibujar (para las pruebas). */
export function missingGlyphs(text: string): string[] {
  return [...new Set([...normalizeText(text)].filter((char) => char !== "\n" && !glyphFor(char)))];
}

export type PixelWord = {
  /** Ancho y alto en píxeles de la tipografía. */
  width: number;
  height: number;
  /** Trazo SVG: un rectángulo por cada tramo de píxeles encendidos seguidos. */
  path: string;
  /** Lo mismo, separado por fila de la letra (0 a 6; las tildes cuentan como fila 0), para pintar por franjas. */
  pathsByRow: string[];
};

/**
 * Convierte una palabra en un dibujo de píxeles.
 * `accentSpace`: reserva las dos filas de arriba para las tildes aunque la palabra no lleve.
 */
export function drawWord(word: string, accentSpace: boolean): PixelWord {
  const top = accentSpace ? ACCENT_ROWS : 0;
  const pathsByRow = Array.from({ length: GLYPH_ROWS }, () => "");
  let x = 0;
  for (const char of normalizeText(word)) {
    const glyph = glyphFor(char) ?? (glyphFor("?") as Glyph);
    const paint = (rows: readonly string[], offsetY: number, band: (row: number) => number) => {
      rows.forEach((row, y) => {
        // Tramos de píxeles seguidos: un solo rectángulo por tramo.
        for (let start = 0; start < row.length; start++) {
          if (row[start] !== "#") continue;
          let end = start;
          while (row[end + 1] === "#") end += 1;
          pathsByRow[band(y)] += `M${x + start} ${offsetY + y}h${end - start + 1}v1h-${end - start + 1}z`;
          start = end;
        }
      });
    };
    paint(glyph.rows, top, (row) => row);
    if (glyph.accent && accentSpace) paint(glyph.accent, 0, () => 0);
    x += glyph.width + LETTER_GAP;
  }
  return { width: Math.max(1, x - LETTER_GAP), height: top + GLYPH_ROWS, path: pathsByRow.join(""), pathsByRow };
}
