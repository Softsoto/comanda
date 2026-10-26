/**
 * Convierte una imagen cualquiera (una foto, un dibujo) en un dibujo de
 * píxeles para los juegos escondidos, a la medida exacta de su espacio.
 *
 * Trabaja con los píxeles en crudo ({ width, height, data } en RGBA, como un
 * ImageData) y no toca el navegador, así que se puede probar en Node. El panel
 * de /admin/juegos lee la imagen con un <canvas> y le pasa sus píxeles.
 *
 * Pasos:
 *   1. Quitar el fondo (si se pide): el color de las esquinas, solo donde toca
 *      el borde de la imagen, para no borrar partes del personaje del mismo color.
 *      Luego se recortan los bordes que quedaron transparentes.
 *   2. Ajustar a la medida: "encajar entera" (con márgenes transparentes) o
 *      "llenar recortando". Cada píxel nuevo es el promedio de la zona de la
 *      imagen que le toca (no se salta píxeles), y queda opaco o transparente.
 *   3. Reducir los colores: se escogen con los píxeles de la imagen original
 *      (corte por mediana y unas vueltas de k-medias para afinarlos) y cada
 *      píxel nuevo toma el más parecido, así los bordes quedan nítidos.
 *   4. Contorno oscuro (si se pide) alrededor de la figura.
 */

import { MAX_COLORS, PIXEL_CHARS, type SpriteArt } from "./game-theme";

export type RGBAImage = { width: number; height: number; data: Uint8ClampedArray };
type RGB = [number, number, number];

export type ConvertOptions = {
  width: number;
  height: number;
  /** "contain": la imagen entera, con márgenes transparentes. "cover": llena el espacio y recorta lo que sobra. */
  fit: "contain" | "cover";
  /** Qué parte se conserva al recortar (0 = izquierda/arriba, 1 = derecha/abajo). */
  focusX?: number;
  focusY?: number;
  /** "image": solo la transparencia que ya traiga la imagen. "corners": además, quita el color de las esquinas. */
  background: "image" | "corners";
  /** Qué tan parecido al fondo debe ser un color para quitarlo (0 a 100). */
  tolerance?: number;
  /**
   * Quitar los bordes transparentes antes de ajustar, para que la figura use
   * todo el espacio (sí, si no se dice; nunca si la imagen ya mide justo eso).
   */
  trim?: boolean;
  /** Cuántos colores puede tener el dibujo (2 a MAX_COLORS), contando el contorno. */
  colors: number;
  outline?: boolean;
};

/** El color del contorno oscuro (el mismo de los personajes originales). */
export const OUTLINE_COLOR = "#07050f";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const toHex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
export const fromHex = (hex: string): RGB => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const luminance = ([r, g, b]: RGB) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Distancia entre colores con pesos parecidos a como los ve el ojo (el verde pesa más). */
function distance(a: RGB, b: RGB) {
  const mean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db;
}

/** Si la imagen trae píxeles transparentes (para sugerir cómo quitar el fondo). */
export function hasTransparency(image: RGBAImage) {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] < 250) return true;
  return false;
}

/** El color del fondo: la mediana de los píxeles de las cuatro esquinas. */
export function cornerColor(image: RGBAImage): string {
  const { width, height, data } = image;
  const patch = Math.max(1, Math.round(Math.min(width, height) * 0.04));
  const channels: number[][] = [[], [], []];
  for (const [cx, cy] of [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ]) {
    for (let y = cy; y < cy + patch; y++)
      for (let x = cx; x < cx + patch; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 128) continue;
        for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
      }
  }
  if (channels[0].length === 0) return "#ffffff";
  const median = (list: number[]) => list.sort((a, b) => a - b)[list.length >> 1];
  return toHex([median(channels[0]), median(channels[1]), median(channels[2])]);
}

/**
 * Quita el fondo: vuelve transparentes los píxeles parecidos a `color` que se
 * alcanzan desde el borde de la imagen sin pasar por otro color.
 */
export function removeBackground(image: RGBAImage, color: string, tolerance: number): RGBAImage {
  const { width, height } = image;
  const data = new Uint8ClampedArray(image.data);
  const key = fromHex(color);
  // La mayor distancia posible entre dos colores, para que la tolerancia vaya de 0 a 100.
  const limit = (clamp(tolerance, 0, 100) / 100) ** 2 * distance([0, 0, 0], [255, 255, 255]);
  const near = (p: number) => data[p * 4 + 3] < 128 || distance([data[p * 4], data[p * 4 + 1], data[p * 4 + 2]], key) <= limit;
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!seen[p] && near(p)) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length > 0) {
    const p = stack.pop()!;
    data[p * 4 + 3] = 0;
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < width * (height - 1)) push(p + width);
  }
  return { width, height, data };
}

/** Recorta los bordes transparentes (deja la imagen igual si no tiene, o si es toda transparente). */
export function trimTransparent(image: RGBAImage): RGBAImage {
  const { width, height, data } = image;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] >= 128) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
  if (right < 0 || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return image;
  const w = right - left + 1;
  const h = bottom - top + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(data.subarray(((top + y) * width + left) * 4, ((top + y) * width + left + w) * 4), y * w * 4);
  return { width: w, height: h, data: out };
}

type Placement = Pick<ConvertOptions, "width" | "height" | "fit" | "focusX" | "focusY">;

/** Cuánto se agranda o achica la imagen y dónde cae su esquina dentro del espacio (puede ser negativo al recortar). */
function placement(image: RGBAImage, options: Placement, inset: number) {
  const innerW = Math.max(1, options.width - inset * 2);
  const innerH = Math.max(1, options.height - inset * 2);
  const scale = options.fit === "cover" ? Math.max(innerW / image.width, innerH / image.height) : Math.min(innerW / image.width, innerH / image.height);
  const fx = options.fit === "cover" ? clamp(options.focusX ?? 0.5, 0, 1) : 0.5;
  const fy = options.fit === "cover" ? clamp(options.focusY ?? 0.5, 0, 1) : 0.5;
  return { scale, ox: inset + (innerW - image.width * scale) * fx, oy: inset + (innerH - image.height * scale) * fy };
}

/** Los colores opacos de la parte de la imagen que se ve (salteando si son muchos), para escoger la paleta. */
function visibleColors(image: RGBAImage, options: Placement, inset: number, limit = 24_000): RGB[] {
  const { scale, ox, oy } = placement(image, options, inset);
  const x0 = Math.max(0, Math.floor((inset - ox) / scale));
  const x1 = Math.min(image.width, Math.ceil((options.width - inset - ox) / scale));
  const y0 = Math.max(0, Math.floor((inset - oy) / scale));
  const y1 = Math.min(image.height, Math.ceil((options.height - inset - oy) / scale));
  const step = Math.max(1, Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / limit)));
  const colors: RGB[] = [];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] >= 128) colors.push([image.data[i], image.data[i + 1], image.data[i + 2]]);
    }
  return colors;
}

/**
 * Ajusta la imagen a `width` × `height` dentro de un marco de `inset` píxeles.
 * Cada píxel nuevo promedia (con su transparencia) la zona que le corresponde.
 * Devuelve el color de cada píxel, o null si queda transparente.
 */
export function resample(image: RGBAImage, options: Pick<ConvertOptions, "width" | "height" | "fit" | "focusX" | "focusY">, inset = 0): (RGB | null)[] {
  const { width, height } = options;
  const sw = image.width;
  const sh = image.height;
  const { scale, ox, oy } = placement(image, options, inset);
  const area = 1 / (scale * scale);
  const out: (RGB | null)[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < inset || y < inset || x >= width - inset || y >= height - inset) {
        out.push(null);
        continue;
      }
      const x0 = clamp((x - ox) / scale, 0, sw);
      const x1 = clamp((x + 1 - ox) / scale, 0, sw);
      const y0 = clamp((y - oy) / scale, 0, sh);
      const y1 = clamp((y + 1 - oy) / scale, 0, sh);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const hy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (hy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const i = (sy * sw + sx) * 4;
          const weight = wx * hy * (image.data[i + 3] / 255);
          r += image.data[i] * weight;
          g += image.data[i + 1] * weight;
          b += image.data[i + 2] * weight;
          a += weight;
        }
      }
      // Opaco si la imagen cubre al menos la mitad del píxel.
      out.push(a / area >= 0.5 ? [r / a, g / a, b / a] : null);
    }
  }
  return out;
}

/**
 * Escoge hasta `count` colores que representen bien a `pixels`: corte por
 * mediana (parte el grupo más disperso por su canal más largo) y luego unas
 * vueltas de k-medias. Si hay pocos colores distintos, se usan tal cual.
 */
export function quantize(pixels: RGB[], count: number): RGB[] {
  if (pixels.length === 0 || count < 1) return [];
  const unique = new Map<string, RGB>();
  for (const pixel of pixels) {
    const rounded: RGB = [Math.round(pixel[0]), Math.round(pixel[1]), Math.round(pixel[2])];
    unique.set(toHex(rounded), rounded);
  }
  if (unique.size <= count) return [...unique.values()];

  // Corte por mediana.
  type Box = { items: RGB[]; spread: number; channel: number };
  const boxOf = (items: RGB[]): Box => {
    let best = 0;
    let channel = 0;
    for (let c = 0; c < 3; c++) {
      let min = 255;
      let max = 0;
      for (const item of items) {
        min = Math.min(min, item[c]);
        max = Math.max(max, item[c]);
      }
      // El verde se nota más: pesa un poco más al elegir por dónde partir.
      const spread = (max - min) * (c === 1 ? 1.2 : c === 0 ? 1 : 0.9);
      if (spread > best) {
        best = spread;
        channel = c;
      }
    }
    return { items, spread: best * Math.sqrt(items.length), channel };
  };
  const boxes: Box[] = [boxOf(pixels)];
  while (boxes.length < count) {
    let pick = -1;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].items.length > 1 && boxes[i].spread > 0 && (pick < 0 || boxes[i].spread > boxes[pick].spread)) pick = i;
    if (pick < 0) break;
    const { items, channel } = boxes[pick];
    const sorted = [...items].sort((a, b) => a[channel] - b[channel]);
    const middle = sorted.length >> 1;
    boxes.splice(pick, 1, boxOf(sorted.slice(0, middle)), boxOf(sorted.slice(middle)));
  }
  const mean = (items: RGB[]): RGB => {
    const sum = items.reduce<RGB>((acc, item) => [acc[0] + item[0], acc[1] + item[1], acc[2] + item[2]], [0, 0, 0]);
    return [sum[0] / items.length, sum[1] / items.length, sum[2] / items.length];
  };
  let centers = boxes.map((box) => mean(box.items));

  // K-medias: cada píxel al centro más cercano, y cada centro al promedio de los suyos.
  for (let round = 0; round < 8; round++) {
    const groups: RGB[][] = centers.map(() => []);
    for (const pixel of pixels) groups[nearest(centers, pixel)].push(pixel);
    const next = groups.map((group, i) => (group.length > 0 ? mean(group) : centers[i]));
    const moved = next.some((center, i) => distance(center, centers[i]) > 1);
    centers = next;
    if (!moved) break;
  }
  // Sin repetidos (dos centros pueden terminar en el mismo color).
  const result = new Map<string, RGB>();
  for (const center of centers) result.set(toHex(center), fromHex(toHex(center)));
  return [...result.values()];
}

function nearest(palette: RGB[], color: RGB) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distance(palette[i], color);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/** Arma el dibujo: cada color recibe un carácter de PIXEL_CHARS (del más oscuro al más claro). */
function toArt(width: number, height: number, cells: (RGB | null)[], palette: RGB[]): SpriteArt {
  const order = palette.map((color, index) => ({ color, index })).sort((a, b) => luminance(a.color) - luminance(b.color));
  const charOf = new Map<number, string>();
  const colors: Record<string, string> = {};
  order.forEach(({ color, index }, position) => {
    charOf.set(index, PIXEL_CHARS[position]);
    colors[PIXEL_CHARS[position]] = toHex(color);
  });
  const used = new Set<string>();
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const cell = cells[y * width + x];
      const char = cell ? charOf.get(nearest(palette, cell))! : ".";
      if (char !== ".") used.add(char);
      row += char;
    }
    rows.push(row);
  }
  for (const char of Object.keys(colors)) if (!used.has(char)) delete colors[char];
  return { rows, colors };
}

/** Convierte una imagen en un dibujo de píxeles a la medida pedida. */
/** Los colores distintos de los píxeles visibles de una imagen (se detiene al pasar de `limit`). */
export function distinctColors(image: RGBAImage, limit = MAX_COLORS + 1): string[] {
  const seen = new Set<string>();
  for (let i = 0; i < image.width * image.height && seen.size <= limit; i++) {
    if (image.data[i * 4 + 3] < 128) continue;
    seen.add(toHex([image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]]));
  }
  return [...seen];
}

/**
 * Un dibujo de píxeles que ya viene a la medida exacta y con pocos colores se
 * copia tal cual, píxel por píxel, sin achicar ni mezclar colores.
 */
export function isReadyArt(image: RGBAImage, width: number, height: number) {
  return image.width === width && image.height === height && distinctColors(image).length <= MAX_COLORS && hasTransparency(image);
}

export function convertImage(image: RGBAImage, options: ConvertOptions): SpriteArt {
  const { width, height } = options;
  const total = clamp(Math.round(options.colors), 2, MAX_COLORS);
  if (options.background !== "corners" && !options.outline && isReadyArt(image, width, height) && distinctColors(image).length <= total) {
    const palette = distinctColors(image).map(fromHex);
    const cells: (RGB | null)[] = [];
    for (let i = 0; i < width * height; i++) {
      cells.push(image.data[i * 4 + 3] < 128 ? null : [image.data[i * 4], image.data[i * 4 + 1], image.data[i * 4 + 2]]);
    }
    return toArt(width, height, cells, palette);
  }
  let source = image;
  if (options.background === "corners") source = removeBackground(image, cornerColor(image), options.tolerance ?? 12);
  // Una imagen que ya mide justo lo del espacio (un dibujo de píxeles hecho a la medida) no se recorta.
  if (options.trim !== false && (image.width !== width || image.height !== height)) source = trimTransparent(source);
  const inset = options.outline ? 1 : 0;
  const cells = resample(source, options, inset);
  const opaque = cells.filter((cell): cell is RGB => cell !== null);
  const outline: RGB = fromHex(OUTLINE_COLOR);
  // La paleta sale de los colores de la imagen (no de los ya promediados): así los
  // bordes entre dos colores toman uno de los dos y no un tono mezclado.
  const samples = visibleColors(source, options, inset);
  let palette = quantize(samples.length > 0 ? samples : opaque, options.outline ? total - 1 : total);
  // Si un color casi no aparece en el dibujo final, su lugar queda para otro más útil.
  if (opaque.length > 0) {
    const counts = palette.map(() => 0);
    for (const cell of opaque) counts[nearest(palette, cell)] += 1;
    const kept = palette.filter((_, i) => counts[i] > 0);
    if (kept.length > 0) palette = kept;
  }
  if (options.outline && opaque.length > 0) {
    const ring: number[] = [];
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (cells[y * width + x]) continue;
        const around = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ].some(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height && cells[ny * width + nx]);
        if (around) ring.push(y * width + x);
      }
    for (const p of ring) cells[p] = outline;
    // Si ya hay un color casi igual al contorno, se usa ese y queda un color libre.
    if (!palette.some((color) => distance(color, outline) < 300)) palette = [...palette, outline];
  }
  return toArt(width, height, cells, palette);
}

/** Un dibujo sin ningún píxel pintado. */
export const isBlankArt = (art: SpriteArt) => art.rows.every((row) => /^\.*$/.test(row));

/** Los píxeles de un dibujo, en RGBA (transparente donde hay "."). */
export function artToImage(art: SpriteArt): RGBAImage {
  const height = art.rows.length;
  const width = art.rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  art.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const hex = art.colors[row[x]];
      if (!hex) continue;
      const [r, g, b] = fromHex(hex);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  });
  return { width, height, data };
}

/**
 * Pasa un dibujo a otra medida (el grande al pequeño del mismo personaje).
 * Encaja el dibujo entero y, en cada píxel nuevo, se queda con el color que
 * más espacio ocupa en su zona (no los mezcla), así se ve nítido y conserva
 * sus colores. Lo transparente pesa un poco menos para que la figura no adelgace.
 */
export function resizeArt(art: SpriteArt, width: number, height: number): SpriteArt {
  const sh = art.rows.length;
  const sw = art.rows[0]?.length ?? 0;
  const scale = Math.min(width / sw, height / sh);
  const ox = (width - sw * scale) / 2;
  const oy = (height - sh * scale) / 2;
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const x0 = clamp((x - ox) / scale, 0, sw);
      const x1 = clamp((x + 1 - ox) / scale, 0, sw);
      const y0 = clamp((y - oy) / scale, 0, sh);
      const y1 = clamp((y + 1 - oy) / scale, 0, sh);
      const weights = new Map<string, number>();
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const hy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (hy <= 0) continue;
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const char = art.colors[art.rows[sy][sx]] ? art.rows[sy][sx] : ".";
          weights.set(char, (weights.get(char) ?? 0) + wx * hy * (char === "." ? 0.75 : 1));
        }
      }
      let best = ".";
      let bestWeight = 0;
      for (const [char, weight] of weights)
        if (weight > bestWeight) {
          best = char;
          bestWeight = weight;
        }
      // Fuera del dibujo (los márgenes al encajar) también queda transparente.
      const covered = (x1 - x0) * (y1 - y0) * scale * scale;
      row += covered >= 0.5 ? best : ".";
    }
    rows.push(row);
  }
  const used = new Set(rows.join(""));
  const colors = Object.fromEntries(Object.entries(art.colors).filter(([char]) => used.has(char)));
  return { rows, colors };
}
