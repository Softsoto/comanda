/**
 * Operaciones del editor de píxeles de /admin/juegos, sin pantalla: pintar,
 * rellenar, voltear, mover y preparar un dibujo para editarlo o guardarlo.
 * Un dibujo son filas de texto: cada carácter es un píxel y "." es transparente.
 */

import { MAX_COLORS, PIXEL_CHARS, type SpriteArt } from "./game-theme";

export type Grid = string[];

export const blankGrid = (width: number, height: number): Grid => Array.from({ length: height }, () => ".".repeat(width));

export function setPixel(grid: Grid, x: number, y: number, char: string): Grid {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[y].length || grid[y][x] === char) return grid;
  const next = [...grid];
  next[y] = grid[y].slice(0, x) + char + grid[y].slice(x + 1);
  return next;
}

/** Los píxeles de una línea recta entre dos puntos (para que un trazo rápido no deje huecos). */
export function lineCells(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const cells: [number, number][] = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    cells.push([x, y]);
    if (x === x1 && y === y1) return cells;
    const double = 2 * error;
    if (double >= dy) {
      error += dy;
      x += sx;
    }
    if (double <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** Balde: pinta con `char` la zona del mismo color que toca el píxel (x, y). */
export function floodFill(grid: Grid, x: number, y: number, char: string): Grid {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (x < 0 || y < 0 || x >= width || y >= height) return grid;
  const target = grid[y][x];
  if (target === char) return grid;
  const cells = grid.map((row) => [...row]);
  const stack: [number, number][] = [[x, y]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    if (cx < 0 || cy < 0 || cx >= width || cy >= height || cells[cy][cx] !== target) continue;
    cells[cy][cx] = char;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return cells.map((row) => row.join(""));
}

/** Espejo: el dibujo mirando al otro lado. */
export const mirror = (grid: Grid): Grid => grid.map((row) => [...row].reverse().join(""));

/** Mueve el dibujo un píxel; lo que se sale por un borde se pierde y entra transparente por el otro. */
export function shift(grid: Grid, dx: number, dy: number): Grid {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const sx = x - dx;
      const sy = y - dy;
      return sx >= 0 && sy >= 0 && sx < width && sy < height ? grid[sy][sx] : ".";
    }).join(""),
  );
}

export const isBlank = (grid: Grid) => grid.every((row) => /^\.*$/.test(row));

export type PaletteEntry = { char: string; hex: string };

/** El primer carácter libre para un color nuevo, o null si ya hay MAX_COLORS. */
export function freeChar(palette: PaletteEntry[]): string | null {
  if (palette.length >= MAX_COLORS) return null;
  const used = new Set(palette.map((entry) => entry.char));
  return [...PIXEL_CHARS].find((char) => !used.has(char)) ?? null;
}

/**
 * Prepara un dibujo para editarlo: deja solo caracteres de PIXEL_CHARS (los
 * originales usan "#", por ejemplo) y lo ajusta a la medida, recortando o
 * rellenando con transparente.
 */
export function toEditable(art: { rows: readonly string[]; colors: Readonly<Record<string, string>> }, width: number, height: number): { grid: Grid; palette: PaletteEntry[] } {
  const palette: PaletteEntry[] = [];
  const map = new Map<string, string>();
  const taken = new Set<string>();
  const entries = Object.entries(art.colors).slice(0, MAX_COLORS);
  for (const [char] of entries) if (PIXEL_CHARS.includes(char)) taken.add(char);
  for (const [char, hex] of entries) {
    let mapped = char;
    if (!PIXEL_CHARS.includes(char) || char.length !== 1) {
      mapped = [...PIXEL_CHARS].find((free) => !taken.has(free))!;
      taken.add(mapped);
    }
    map.set(char, mapped);
    palette.push({ char: mapped, hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : "#000000" });
  }
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => map.get(art.rows[y]?.[x] ?? ".") ?? ".").join(""),
  );
  if (palette.length === 0) palette.push({ char: "0", hex: "#07050f" });
  return { grid, palette };
}

/** El dibujo listo para guardar: solo los colores que se usan. */
export function toArt(grid: Grid, palette: PaletteEntry[]): SpriteArt {
  const used = new Set(grid.join(""));
  const colors: Record<string, string> = {};
  for (const entry of palette) if (used.has(entry.char)) colors[entry.char] = entry.hex;
  return { rows: [...grid], colors };
}
