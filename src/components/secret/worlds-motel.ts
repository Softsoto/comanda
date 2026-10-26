/**
 * Mundo 5 · EL CUARTO DEL JACUZZI.
 *
 * Una habitación de motel de noche, tranquila y elegante. Las paredes son de un
 * ciruela muy oscuro con un papel tapiz de rombos apenas marcado; arriba, bajo
 * la cornisa, una tira de luz violeta escondida baña el techo. A un lado está
 * el protagonista: un jacuzzi sobre una tarima de piedra con el frente de
 * mosaico verde agua, el agua turquesa encendida desde adentro, burbujas que
 * suben y revientan, dos chorros que borbotean y vapor que sube despacio. Sobre
 * él, en la pared, un letrero de neón propio: una luna creciente violeta con
 * una estrellita y la palabra RELAX en rosado. La luz del agua dibuja reflejos
 * que tiemblan en la pared. En la tarima hay velas encendidas y toallas
 * dobladas, y al lado una planta de hojas grandes.
 *
 * Al otro lado, una ventana alta con cortinas de terciopelo: afuera llueve sobre
 * la ciudad de noche (edificios con ventanas que se prenden y se apagan, una
 * luz roja en lo alto de una antena) y por el vidrio bajan gotas. Debajo, una
 * cama grande con cabecera capitoneada, almohadas, un camino de cama y una luz
 * rosada por debajo; junto a ella, una mesita de noche con su lámpara cálida.
 *
 * Lo que manda es la luz: tres fuentes de color (el neón rosado y violeta, el
 * agua cian y la lámpara ámbar) que tiñen con tramado lo que tienen cerca.
 *
 * Cómo se pinta: tres capas hechas una sola vez. Atrás, la pared, el piso, la
 * vista de la ciudad y el letrero; en medio, los muebles (ventana, cortinas,
 * cama, lámpara, planta, jacuzzi); delante, una sombra suave en los bordes. En
 * cada cuadro solo se dibuja, entre capa y capa, lo que se mueve: la lluvia,
 * las luces de la ciudad, los reflejos de la pared, el agua, las burbujas, las
 * llamas de las velas y el vapor.
 */

import { clamp, dither, paintSprite, rect, seeded, type Colors, type Ctx, type Sprite } from "./art";
import { line, layer, places, sky, wrap, type Scene } from "./scenery";

/* ---------- Paleta ---------- */

/** Pared: más oscura arriba, donde no llega la luz de nada. */
const WALL = ["#12061a", "#170a20", "#1d0c26", "#230f2c", "#2a1232", "#2f1536"];
const WALL_STOPS = [0, 0.16, 0.34, 0.52, 0.7, 0.86];
/** Piso de madera: el brillo de la pared cerca del zócalo y se oscurece hacia acá. */
const FLOOR = ["#2e1430", "#27112a", "#200d24", "#19091d"];
const FLOOR_STOPS = [0, 0.22, 0.5, 0.78];
const SEAM = "#1a0918";

/** Neón: núcleo casi blanco, tubo de color, tubo fino (para letras de un píxel) y el halo en la pared. */
type Neon = { core: string; tube: string; thin: string; halo: string };
const PINK: Neon = { core: "#fff0f8", tube: "#ff6fb5", thin: "#ffa6d4", halo: "#6a1c58" };
const VIOLET: Neon = { core: "#f6ecff", tube: "#b98cff", thin: "#d2b4ff", halo: "#40246e" };
const CYAN: Neon = { core: "#effeff", tube: "#7ff6ff", thin: "#b8fbff", halo: "#1e4466" };
const NEONS = [PINK, PINK, VIOLET, CYAN];

/** Agua del jacuzzi, del centro encendido a la orilla. */
const WATER = ["#d8feff", "#7ff6ff", "#46dcec", "#25afcc", "#178aa8", "#0f6283"];

/** Lo cálido: velas y lámpara, del más claro al más apagado. */
const FIRE = ["#fffbe8", "#ffd27a", "#f08a3a", "#b0502c"];


/* ---------- Dibujos ---------- */

/** Letras del letrero, de 5 × 7. */
const FONT: Record<string, Sprite> = {
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
};

/** Llamas de vela: quieta, inclinada a cada lado y agachada (cuando le da un soplo). */
const FLAME_COLORS: Colors = { W: FIRE[0], y: FIRE[1], o: FIRE[2] };
const FLAMES: readonly Sprite[] = [
  [".o.", ".y.", "yWy"],
  ["o..", ".y.", "yWy"],
  ["..o", ".y.", "yWy"],
  ["...", ".o.", "yWy"],
];
const BIG_FLAMES: readonly Sprite[] = [
  [".o.", ".y.", ".W.", "yWy"],
  ["o..", ".y.", ".W.", "yWy"],
  ["..o", ".y.", ".W.", "yWy"],
  ["...", ".o.", ".y.", "yWy"],
];

/* ---------- Herramientas de este paisaje ---------- */

/** Ruido fijo: el mismo número da siempre lo mismo. */
const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Resplandor tramado en forma de óvalo (la luz de un letrero ancho no es redonda). */
function haze(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string, strength: number) {
  c.fillStyle = color;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1 && dither(x, y, (1 - Math.sqrt(d)) * strength)) c.fillRect(x, y, 1, 1);
    }
  }
}

/** Degradado por franjas dentro de un rectángulo (el cielo de la ventana). */
function bands(c: Ctx, x: number, y: number, w: number, h: number, colors: readonly string[], stops: readonly number[]) {
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(0, y);
  sky(c, x + w, h, colors, stops);
  c.restore();
}

/* ---------- Piezas ---------- */

/**
 * El letrero de neón: luna creciente violeta (solo el contorno, como un tubo
 * doblado), una estrellita cian dentro de la luna y RELAX en rosado. Cada tubo
 * tiene su halo pegado en la pared. Devuelve dónde quedó la X, que a veces
 * parpadea, y su versión apagada.
 */
function neonSign(c: Ctx, cx: number, cy: number, s: number) {
  const text = "RELAX";
  const mr = 6 * s;
  const letterW = 5 * s;
  const letterH = 7 * s;
  const gap = 2 * s;
  const textW = text.length * letterW + (text.length - 1) * gap;
  const pad = 4;
  const gw = pad * 2 + mr * 2 + 1 + 4 * s + textW;
  const gh = pad * 2 + mr * 2 + 1;
  // Qué tubo hay en cada píxel: 0 nada, 1 rosado, 2 violeta, 3 cian.
  const kind = new Uint8Array(gw * gh);
  const set = (x: number, y: number, k: number) => {
    if (x >= 0 && y >= 0 && x < gw && y < gh) kind[y * gw + x] = k;
  };

  // La luna: un disco con un mordisco a la derecha; el tubo sigue solo su borde.
  const mcx = pad + mr;
  const mcy = pad + mr;
  const crescent = (dx: number, dy: number) =>
    dx * dx + dy * dy <= mr * mr + mr * 0.8 && (dx - mr * 0.5) ** 2 + (dy + mr * 0.25) ** 2 > (mr * 0.82) ** 2;
  for (let dy = -mr; dy <= mr; dy++) {
    for (let dx = -mr; dx <= mr; dx++) {
      if (!crescent(dx, dy)) continue;
      let edge = false;
      for (let k = 1; k <= s && !edge; k++) {
        edge = !crescent(dx + k, dy) || !crescent(dx - k, dy) || !crescent(dx, dy + k) || !crescent(dx, dy - k);
      }
      if (edge) set(mcx + dx, mcy + dy, 2);
    }
  }
  // La estrellita, abrazada por la luna.
  const sx = mcx + Math.round(mr * 0.45);
  const sy = mcy - Math.round(mr * 0.15);
  for (let k = -s; k <= s; k++) {
    set(sx + k, sy, 3);
    set(sx, sy + k, 3);
  }

  // Las letras, centradas con la luna.
  const tx = pad + mr * 2 + 1 + 4 * s;
  const ty = mcy - (letterH >> 1);
  for (let index = 0; index < text.length; index++) {
    const rows = FONT[text[index]];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (rows[row][col] !== "#") continue;
        for (let by = 0; by < s; by++) for (let bx = 0; bx < s; bx++) set(tx + index * (letterW + gap) + col * s + bx, ty + row * s + by, 1);
      }
    }
  }

  const ox = Math.round(cx - gw / 2);
  const oy = Math.round(cy - gh / 2);
  // El halo: cada píxel apagado toma el color del tubo más cercano, más ralo cuanto más lejos.
  const reach = 3;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (kind[y * gw + x]) continue;
      let best = 99;
      let near = 0;
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const k = kind[(y + dy) * gw + x + dx];
          if (!k || x + dx < 0 || x + dx >= gw || y + dy < 0 || y + dy >= gh) continue;
          const d = Math.hypot(dx, dy);
          if (d < best) {
            best = d;
            near = k;
          }
        }
      }
      if (near && dither(ox + x, oy + y, (1 - best / (reach + 1)) * 0.62)) rect(c, ox + x, oy + y, 1, 1, NEONS[near].halo);
    }
  }
  // Los tubos: por dentro el núcleo blanco; en el borde, el color.
  const same = (x: number, y: number, k: number) => x >= 0 && y >= 0 && x < gw && y < gh && kind[y * gw + x] === k;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const k = kind[y * gw + x];
      if (!k) continue;
      const inner = same(x - 1, y, k) && same(x + 1, y, k) && same(x, y - 1, k) && same(x, y + 1, k);
      rect(c, ox + x, oy + y, 1, 1, inner ? NEONS[k].core : s === 1 ? NEONS[k].thin : NEONS[k].tube);
    }
  }

  // La X apagada: los mismos tubos en un rosado oscuro (el halo se queda, como el vidrio aún tibio).
  const xx = tx + 4 * (letterW + gap);
  const off = layer(letterW, letterH);
  for (let y = 0; y < letterH; y++) {
    for (let x = 0; x < letterW; x++) if (kind[(ty + y) * gw + xx + x] === 1) rect(off.c, x, y, 1, 1, "#7a2a5e");
  }
  return { off, x: ox + xx, y: oy + ty, width: gw, height: gh };
}

/** Cortina de terciopelo: pliegues verticales, recogida con un cordón dorado y abierta abajo. */
function curtain(c: Ctx, outer: number, side: -1 | 1, top: number, bottom: number, width: number, tie: number, lit: boolean) {
  const shades = lit ? ["#2a0c26", "#4a143e", "#6a2058", "#8e3274"] : ["#22091f", "#3a1032", "#561a4a", "#6e2660"];
  for (let y = top; y < bottom; y++) {
    // Ancho de la cortina en esta fila: entera arriba, apretada en el cordón y abierta al caer.
    let w: number;
    if (y < tie) w = width - Math.round(((y - top) / Math.max(1, tie - top)) ** 2 * width * 0.45);
    else w = Math.round(width * 0.55 + ((y - tie) / Math.max(1, bottom - tie)) * width * 0.55);
    for (let k = 0; k < w; k++) {
      const u = k / Math.max(1, w);
      const fold = Math.sin(u * Math.PI * 3.2 + (side < 0 ? 0 : 1.3));
      const tone = clamp(Math.round(1.5 + fold * 1.4), 0, 3);
      const x = side < 0 ? outer + k : outer - k;
      rect(c, x, y, 1, 1, shades[tone]);
      // Entre un tono y otro, tramado, para que el pliegue se vea redondo.
      if (tone < 3 && fold * 1.4 + 1.5 - tone > 0.5 && dither(x, y, 0.5)) rect(c, x, y, 1, 1, shades[tone + 1]);
    }
    // El borde de adentro recibe más luz.
    rect(c, side < 0 ? outer + w - 1 : outer - w + 1, y, 1, 1, shades[3]);
  }
  // El cordón que la recoge.
  const tw = Math.round(width * 0.55) + 1;
  rect(c, side < 0 ? outer : outer - tw + 1, tie, tw, 1, "#e0b46a");
  rect(c, side < 0 ? outer : outer - tw + 1, tie + 1, tw, 1, "#8a6034");
  rect(c, side < 0 ? outer + tw - 1 : outer - tw + 1, tie + 2, 1, 3, "#c89a5a");
}

/** Planta de hojas grandes en una maceta de cerámica. Las hojas de atrás, más oscuras. */
function plant(c: Ctx, random: () => number, x: number, base: number, size: number) {
  const potW = Math.max(6, Math.round(size * 0.36));
  const potH = Math.max(5, Math.round(size * 0.32));
  const potTop = base - potH;
  // Sombra en el piso.
  for (let dx = -potW; dx <= potW; dx++) if (dither(x + dx, base, 0.6)) rect(c, x + dx, base, 1, 1, "#0e050c");

  // Hojas: un tallo curvo y una hoja ovalada con nervio al centro.
  const count = 6 + Math.round(size / 7);
  for (let index = 0; index < count; index++) {
    const back = index < count * 0.45;
    const angle = -Math.PI / 2 + (random() * 2 - 1) * 1.05;
    const length = size * (0.5 + random() * 0.45);
    const sx = x + Math.round((random() - 0.5) * potW * 0.4);
    const ex = sx + Math.cos(angle) * length * 0.62;
    const ey = potTop + Math.sin(angle) * length * 0.62;
    line(c, sx, potTop, Math.round(ex), Math.round(ey), 1, back ? "#0f2620" : "#173c30");
    const long = Math.max(3, size * (0.2 + random() * 0.1));
    const broad = Math.max(1.6, long * 0.45);
    // La hoja se inclina un poco hacia abajo en la punta, como si pesara.
    const tilt = angle + (Math.cos(angle) > 0 ? 0.35 : -0.35);
    const cx = ex + Math.cos(tilt) * long * 0.8;
    const cy = ey + Math.sin(tilt) * long * 0.8;
    const ca = Math.cos(tilt);
    const sa = Math.sin(tilt);
    const span = Math.ceil(long) + 1;
    for (let dy = -span; dy <= span; dy++) {
      for (let dx = -span; dx <= span; dx++) {
        const u = dx * ca + dy * sa;
        const v = -dx * sa + dy * ca;
        const d = (u / long) ** 2 + (v / broad) ** 2;
        if (d > 1) continue;
        let color = v < 0 ? (back ? "#1c4a3c" : "#3a8664") : back ? "#123228" : "#235e48";
        if (d > 0.7 && v < 0 && !back) color = "#5cae86";
        if (Math.abs(v) < 0.6 && u < long * 0.8 && broad >= 2.5) color = back ? "#0f2620" : "#173c30";
        rect(c, Math.round(cx + dx), Math.round(cy + dy), 1, 1, color);
      }
    }
  }

  // La maceta: se angosta hacia abajo, con el borde de arriba claro.
  for (let row = 0; row < potH; row++) {
    const w = potW - Math.round((row / potH) * potW * 0.25);
    const left = x - (w >> 1);
    rect(c, left, potTop + row, w, 1, "#2c1a3c");
    rect(c, left, potTop + row, 1, 1, "#5a4078");
    rect(c, left + 1, potTop + row, Math.max(1, w >> 3), 1, "#45305e");
    rect(c, left + w - 2, potTop + row, 2, 1, "#1a0e26");
  }
  rect(c, x - (potW >> 1) - 1, potTop, potW + 2, 1, "#6a4e88");
  rect(c, x - (potW >> 1) - 1, potTop + 1, potW + 2, 1, "#24142e");
}

/* ---------- La escena ---------- */

type Light = { x: number; y: number; color: string; phase: number; speed: number };
type Drop = { x: number; start: number; speed: number; trail: number; phase: number };
type Streak = { x: number; y: number; speed: number; length: number };
type Bubble = { period: number; offset: number };
type Wisp = { x: number; tall: number; sway: number; phase: number; drift: number; spread: number };
type Candle = { x: number; y: number; big: boolean; phase: number };

export function motel(width: number, height: number): Scene {
  const random = seeded(5151);
  const place = places(width);
  const wide = place.wide;
  // En pantallas grandes, el letrero y las velas van al doble.
  const big = width >= 600;
  const s = big ? 2 : 1;
  // El letrero crece antes: desde que la pantalla es ancha ya va al doble.
  const signScale = width >= 900 ? 3 : wide ? 2 : 1;

  const ceil = clamp(Math.round(height * 0.045), 5, 18);
  const floorY = Math.round(height * 0.63);
  const fd = height - floorY;

  /* Dónde va cada cosa. */
  // El jacuzzi, a un lado y bien adelante.
  const jw = wide ? clamp(Math.round(width * 0.3), 110, 270) : clamp(Math.round(width * 0.54), 58, 84);
  const jx = Math.max(place.left, (jw >> 1) + (wide ? 4 : 2));
  const dd = Math.round(jw * 0.32); // profundidad de la tarima vista desde arriba
  const jf = Math.round(jw * 0.17); // alto del frente de mosaico
  const jBase = height - Math.max(7, Math.round(fd * 0.2));
  const deckTop = jBase - jf - dd;
  const x0 = jx - (jw >> 1);
  const x1 = x0 + jw;
  const rx = Math.round(jw * 0.36);
  const ry = Math.max(3, Math.round(dd * 0.34));
  const wcy = deckTop + Math.round(dd * 0.5);

  // La cama, al otro lado, contra la pared y bajo la ventana.
  const bw = wide ? clamp(Math.round(width * 0.22), 80, 200) : clamp(Math.round(width * 0.34), 36, 56);
  const bx = wide ? place.right : Math.min(place.right, width - (bw >> 1) - 13);
  const hbH = clamp(Math.round(bw * 0.4), 16, 70);
  const bf = Math.max(5, Math.round(bw * 0.13));
  const bdp = Math.round(bw * 0.24);

  // La ventana, encima de la cabecera.
  const ww = wide ? clamp(Math.round(bw * 0.9), 60, 180) : clamp(Math.round(bw * 0.85), 30, 48);
  const wy1 = floorY - hbH - 8;
  const wh = Math.min(wy1 - Math.max(ceil + 14, wide ? Math.round(height * 0.12) : 26), Math.round(ww * 3));
  const wy0 = wy1 - wh;
  const wx0 = bx - (ww >> 1);
  const frame = ww >= 70 ? 3 : 2;
  const gx0 = wx0 + frame;
  const gy0 = wy0 + frame;
  const gw = ww - frame * 2;
  const gh = wh - frame * 2;

  // La mesita de noche: hacia el centro en pantallas anchas; en el celular, contra el borde.
  const nsw = clamp(Math.round(bw * 0.22), 10, 30);
  const nsx = wide ? bx - (bw >> 1) - 5 - (nsw >> 1) : bx + (bw >> 1) + 4 + (nsw >> 1);
  const nsh = Math.round(nsw * 0.95);
  const nsBase = floorY + 3;
  const shadeH = Math.max(5, Math.round(nsw * 0.55));
  const shadeY = nsBase - nsh - Math.round(nsw * 0.5) - shadeH;

  const signY = wide ? Math.round(floorY * 0.33) : Math.max(ceil + 30, Math.round(floorY * 0.3));

  /* ===== Atrás: pared, piso, la ciudad por la ventana y el letrero. ===== */
  const back = layer(width, height);
  let c = back.c;
  sky(c, width, floorY, WALL, WALL_STOPS);

  // Papel tapiz: un enrejado de rombos punteado y un puntito en el centro de cada rombo.
  const cell = big ? 14 : 10;
  c.fillStyle = "#2a1334";
  for (let y = ceil + 4; y < floorY - 4; y++) {
    for (let x = 0; x < width; x++) {
      const a = (x + y) % cell;
      const b = (((x - y) % cell) + cell) % cell;
      if ((a === 0 || b === 0) && (x + y) % 2 === 0) c.fillRect(x, y, 1, 1);
      else if (a === cell >> 1 && b === cell >> 1) c.fillRect(x, y, 1, 1);
    }
  }

  // Techo y cornisa, con la tira de luz violeta escondida que pinta la pared de arriba.
  rect(c, 0, 0, width, ceil, "#0c030f");
  for (let x = 0; x < width; x += 2) if (dither(x, ceil - 2, 0.5)) rect(c, x, ceil - 2, 1, 1, "#24103a");
  const cove = clamp(Math.round(height * 0.07), 7, 26);
  c.fillStyle = "#34184e";
  for (let row = 0; row < cove; row++) {
    const y = ceil + 3 + row;
    for (let x = 0; x < width; x++) if (dither(x, y, (1 - row / cove) * 0.55)) c.fillRect(x, y, 1, 1);
  }
  rect(c, 0, ceil, width, 1, "#5a2e66");
  rect(c, 0, ceil + 1, width, 1, "#3a1a46");
  rect(c, 0, ceil + 2, width, 1, "#1a0a20");
  // Contra el techo la cornisa recibe el violeta de la tira.
  rect(c, 0, ceil - 1, width, 1, "#8a5ad0");

  // El piso: tablas que se abren desde el fondo hacia nosotros.
  c.save();
  c.translate(0, floorY);
  sky(c, width, fd, FLOOR, FLOOR_STOPS);
  c.restore();
  const vpX = width / 2;
  const vpY = floorY - fd * 1.6;
  const plank = clamp(Math.round(width / 16), 8, 34);
  const atRow = (xb: number, y: number) => vpX + ((xb - vpX) * (y - vpY)) / (height - vpY);
  const seams: number[] = [];
  for (let xb = (vpX % plank) - plank * 3; xb <= width + plank * 3; xb += plank) seams.push(xb);
  for (const xb of seams) line(c, Math.round(atRow(xb, floorY)), floorY, Math.round(xb), height, 1, SEAM);
  // Las uniones de las tablas, salteadas; y un canto de luz junto a algunas.
  for (let index = 0; index + 1 < seams.length; index++) {
    for (let k = 0; k < 2; k++) {
      const y = floorY + 3 + Math.floor(random() * (fd - 4));
      const from = Math.round(atRow(seams[index], y)) + 1;
      const to = Math.round(atRow(seams[index + 1], y));
      rect(c, from, y, to - from, 1, SEAM);
    }
    // El barniz brilla a lo largo de cada tabla, tenue y tramado.
    c.fillStyle = "#35183a";
    for (let y = floorY + 1; y < height; y++) {
      const x = Math.round(atRow(seams[index], y) * 0.7 + atRow(seams[index + 1], y) * 0.3);
      if (dither(x, y, 0.45 * (1 - (y - floorY) / fd))) c.fillRect(x, y, 1, 1);
    }
  }

  // Luz del agua: la pared detrás del jacuzzi y el piso a su alrededor se tiñen de azul.
  haze(c, jx, floorY, jw * 0.62, floorY * 0.42, "#20234a", 0.6);
  haze(c, jx, floorY, jw * 0.45, floorY * 0.24, "#24345c", 0.5);
  haze(c, jx, jBase - 2, jw * 0.75, fd * 0.45, "#172a48", 0.55);
  // El neón se refleja en el piso brillante, junto al zócalo.
  haze(c, jx, floorY + 4, jw * 0.42, Math.max(4, fd * 0.08), "#4a1846", 0.6);

  // La lámpara: luz ámbar en la pared, con un cono hacia arriba y otro hacia abajo.
  const lampY = shadeY + (shadeH >> 1);
  haze(c, nsx, lampY, nsw * 2.2, nsw * 2.4, "#341828", 0.5);
  haze(c, nsx, lampY, nsw * 1.3, nsw * 1.4, "#4e2632", 0.45);
  c.fillStyle = "#6a3434";
  for (let row = 1; row < nsw * 1.8; row++) {
    const half = Math.round(nsw * 0.28 + row * 0.55);
    const y = shadeY - row;
    for (let x = nsx - half; x <= nsx + half; x++) {
      if (dither(x, y, (1 - row / (nsw * 1.8)) * 0.55 * (1 - Math.abs(x - nsx) / (half + 1)))) c.fillRect(x, y, 1, 1);
    }
  }
  // Luz rosada que se escapa por debajo de la cama.
  haze(c, bx, floorY + bdp + bf + 1, bw * 0.62, Math.max(4, bf * 0.7), "#5a1a50", 0.7);
  // La ventana echa un poco de luz azul fría en la pared de alrededor.
  haze(c, bx, wy0 + wh / 2, ww * 0.85, wh * 0.7, "#1e1846", 0.45);

  // El zócalo.
  rect(c, 0, floorY - 4, width, 4, "#2a1430");
  rect(c, 0, floorY - 4, width, 1, "#55305a");
  rect(c, 0, floorY - 1, width, 1, "#12060f");

  // Por la ventana: cielo de ciudad, nublado y tibio abajo por las luces.
  bands(c, gx0, gy0, gw, gh, ["#070722", "#0b0a2e", "#130f3c", "#1e154a", "#2e1956", "#40205e"], [0, 0.18, 0.38, 0.58, 0.76, 0.9]);
  const lights: Light[] = [];
  const beacons: { x: number; y: number }[] = [];
  // Edificios lejanos: más claros y azulados, con ventanitas apagadas.
  for (let x = gx0; x < gx0 + gw; ) {
    const bwid = 3 + Math.floor(random() * 6) * s;
    const top = gy0 + gh - Math.round(gh * (0.22 + random() * 0.3));
    rect(c, x, top, bwid, gy0 + gh - top, "#251c52");
    rect(c, x, top, bwid, 1, "#3a2c72");
    for (let wy = top + 2; wy < gy0 + gh - 1; wy += 2) {
      for (let wx = x + 1; wx < x + bwid - 1; wx += 2) if (random() < 0.22) rect(c, wx, wy, 1, 1, random() < 0.5 ? "#4a3c86" : "#7a5a8a");
    }
    x += bwid + (random() < 0.3 ? 1 : 0);
  }
  // Edificios cercanos: oscuros, con ventanas encendidas de colores tibios.
  let tallest = { x: 0, top: gy0 + gh };
  for (let x = gx0 - 2; x < gx0 + gw; ) {
    const bwid = 5 + Math.floor(random() * 7) * s;
    const top = gy0 + gh - Math.round(gh * (0.14 + random() * random() * 0.5));
    rect(c, x, top, bwid, gy0 + gh - top, "#120c2c");
    rect(c, x, top, bwid, 1, "#2a2052");
    rect(c, x, top, 1, gy0 + gh - top, "#1c1440");
    if (top < tallest.top) tallest = { x: x + (bwid >> 1), top };
    for (let wy = top + 2; wy < gy0 + gh - 1; wy += 3) {
      for (let wx = x + 2; wx < x + bwid - 1; wx += 2) {
        const roll = random();
        if (roll > 0.4) continue;
        const color = roll < 0.18 ? "#ffcf7a" : roll < 0.27 ? "#ff9fd0" : roll < 0.33 ? "#8fe8ff" : "#3a2a5a";
        rect(c, wx, wy, 1, 1, color);
        if (roll < 0.33 && random() < 0.35) lights.push({ x: wx, y: wy, color, phase: random() * 6.28, speed: 0.05 + random() * 0.12 });
      }
    }
    x += bwid + Math.floor(random() * 3);
  }
  // Una antena con su luz roja sobre el edificio más alto.
  const antenna = Math.max(3, Math.round(gh * 0.08));
  if (tallest.top - antenna > gy0 + 2) {
    rect(c, tallest.x, tallest.top - antenna, 1, antenna, "#2a2052");
    beacons.push({ x: tallest.x, y: tallest.top - antenna - 1 });
  }
  // Gotitas quietas pegadas al vidrio, y dos reflejos en diagonal.
  for (let k = 0; k < (gw * gh) / 110; k++) {
    const dx = gx0 + Math.floor(random() * gw);
    const dy = gy0 + Math.floor(random() * gh);
    rect(c, dx, dy, 1, 1, random() < 0.25 ? "#7a8ad0" : "#38448a");
  }
  c.fillStyle = "#3a3478";
  for (let y = gy0; y < gy0 + gh; y++) {
    for (let x = gx0; x < gx0 + gw; x++) {
      const band = (x - gx0 + (y - gy0) * 0.6) / gw;
      if ((Math.abs(band - 0.35) < 0.06 || Math.abs(band - 0.5) < 0.025) && dither(x, y, 0.25)) c.fillRect(x, y, 1, 1);
    }
  }

  // El letrero, con su luz rosada en la pared alrededor.
  const signCx = jx;
  haze(c, signCx, signY, jw * 0.6 + 10 * signScale, 26 * signScale, "#2c0f34", 0.6);
  haze(c, signCx, signY, jw * 0.4 + 6 * signScale, 14 * signScale, "#3e1442", 0.55);
  const sign = neonSign(c, signCx, signY, signScale);

  /* ===== En medio: los muebles. ===== */
  const middle = layer(width, height);
  c = middle.c;

  // Barra de las cortinas, con remates de bronce.
  const cw = clamp(Math.round(ww * 0.22), 5, 30);
  const rodY = wy0 - 3;
  rect(c, wx0 - cw - 4, rodY, ww + cw * 2 + 8, 1, "#c89a5a");
  rect(c, wx0 - cw - 4, rodY + 1, ww + cw * 2 + 8, 1, "#6a4428");
  rect(c, wx0 - cw - 6, rodY - 1, 2, 3, "#e8c27a");
  rect(c, wx0 + ww + cw + 4, rodY - 1, 2, 3, "#e8c27a");

  // Marco de la ventana: madera oscura, canto de luz rosada arriba y a la izquierda.
  rect(c, wx0, wy0, ww, frame, "#2a1424");
  rect(c, wx0, wy0 + wh - frame, ww, frame, "#2a1424");
  rect(c, wx0, wy0, frame, wh, "#2a1424");
  rect(c, wx0 + ww - frame, wy0, frame, wh, "#2a1424");
  rect(c, wx0, wy0, ww, 1, "#6a3a62");
  rect(c, wx0, wy0, 1, wh, "#5a3256");
  rect(c, gx0, gy0, gw, 1, "#0c0414");
  rect(c, gx0, gy0, 1, gh, "#0c0414");
  // Travesaños: uno al medio y otro a dos tercios de la altura.
  const mullion = wx0 + (ww >> 1);
  rect(c, mullion - 1, gy0, 2, gh, "#2a1424");
  rect(c, mullion - 1, gy0, 1, gh, "#4a2a44");
  const crossY = gy0 + Math.round(gh * 0.36);
  rect(c, gx0, crossY, gw, 2, "#2a1424");
  rect(c, gx0, crossY, gw, 1, "#4a2a44");
  // El alféizar sobresale un poco, con su canto claro.
  rect(c, wx0 - 3, wy0 + wh, ww + 6, 2, "#4a2846");
  rect(c, wx0 - 3, wy0 + wh, ww + 6, 1, "#7a4a72");
  rect(c, wx0 - 3, wy0 + wh + 2, ww + 6, 1, "#12060f");
  // Una suculenta chiquita en el alféizar.
  const pot = wx0 + Math.round(ww * 0.78);
  rect(c, pot - 2, wy0 + wh - 3, 4, 3, "#c06a8a");
  rect(c, pot - 2, wy0 + wh - 3, 4, 1, "#e08aa8");
  paintSprite(c, [".g.g.", "gGgGg", ".gGg."], { g: "#2e6a50", G: "#5aae86" }, pot - 2, wy0 + wh - 6);

  // Cortinas a los dos lados, hasta el piso. La de la izquierda recibe más neón.
  const tie = wy0 + Math.round(wh * 0.62);
  curtain(c, wx0 - cw - 2, -1, rodY + 2, floorY, cw + 4, tie, true);
  curtain(c, wx0 + ww + cw + 1, 1, rodY + 2, floorY, cw + 4, tie, false);

  // La cabecera capitoneada.
  const hx0 = bx - (bw >> 1) - 2;
  const hw = bw + 4;
  const hTop = floorY - hbH;
  for (let y = hTop; y <= floorY; y++) {
    // Esquinas redondeadas arriba.
    const cut = y === hTop ? 2 : y === hTop + 1 ? 1 : 0;
    rect(c, hx0 + cut, y, hw - cut * 2, 1, "#3a1f5a");
  }
  rect(c, hx0 + 2, hTop, hw - 4, 1, "#7a5aa8");
  rect(c, hx0 + 1, hTop + 1, hw - 2, 1, "#5a3c88");
  rect(c, hx0, hTop + 2, 1, hbH - 2, "#54367e");
  rect(c, hx0 + hw - 1, hTop + 2, 1, hbH - 2, "#24123c");
  const tuft = big ? 8 : 6;
  for (let row = 0, y = hTop + 4; y < floorY - bf - 2; row++, y += tuft >> 1) {
    for (let x = hx0 + 3 + (row % 2 ? tuft >> 1 : 0); x < hx0 + hw - 3; x += tuft) {
      // Cada botón hunde la tela: un punto oscuro y un brillo arriba a la izquierda.
      rect(c, x, y, 1, 1, "#1c0c32");
      rect(c, x - 1, y - 1, 1, 1, "#5a3a86");
      if (dither(x + 1, y + 1, 0.5)) rect(c, x + 1, y + 1, 1, 1, "#2a1446");
    }
  }

  // El colchón visto desde arriba: sábana, almohadas y el edredón.
  const bTop = floorY - bf;
  const bFront = floorY + bdp;
  const flare = Math.round(bdp * 0.15);
  const spanAt = (y: number) => {
    const f = (y - bTop) / Math.max(1, bFront - bTop);
    return Math.round((bw >> 1) + f * flare);
  };
  for (let y = bTop; y <= bFront; y++) {
    const half = spanAt(y);
    const f = (y - bTop) / Math.max(1, bFront - bTop);
    // Arriba (junto a la cabecera) la sábana blanca doblada; luego el edredón rosa vino.
    const color = f < 0.2 ? "#b8a6d8" : f < 0.3 ? "#f2eaf8" : f < 0.34 ? "#c8b8e0" : "#6e2a5e";
    rect(c, bx - half, y, half * 2, 1, color);
    if (f >= 0.34) {
      // El edredón está acolchado: costuras en rombo, tenues.
      for (let x = bx - half; x < bx + half; x++) {
        if (((x + y * 2) % 8 === 0 || (x - y * 2 + 800) % 8 === 0) && dither(x, y, 0.5)) rect(c, x, y, 1, 1, "#5a2050");
      }
      rect(c, bx - half, y, 1, 1, "#8a3a76");
      // Cerca del borde de adelante el edredón se curva y recibe la luz de la lámpara.
      if (f > 0.82) for (let x = bx - half; x < bx + half; x++) if (dither(x, y, (f - 0.82) * 3)) rect(c, x, y, 1, 1, "#8a3a76");
    }
  }
  // El camino de cama: una franja oscura con hilos dorados a lo ancho.
  const runY = bTop + Math.round((bFront - bTop) * 0.68);
  const runH = Math.max(3, Math.round(bdp * 0.2));
  for (let y = runY; y < runY + runH; y++) {
    const half = spanAt(y) + 1;
    rect(c, bx - half, y, half * 2, 1, y === runY || y === runY + runH - 1 ? "#c89a5a" : "#2a1a4a");
  }
  // Almohadas: dos grandes y un cojín rosado delante.
  const pw = Math.round(bw * 0.38);
  const ph = Math.max(5, Math.round(bf * 1.1));
  const py = bTop - Math.round(ph * 0.55);
  for (const left of [bx - pw - 1, bx + 1]) {
    for (let row = 0; row < ph; row++) {
      // Esquinas redondeadas y el centro más inflado: luz arriba, sombra lila abajo.
      const cut = row === 0 || row === ph - 1 ? 2 : row === 1 || row === ph - 2 ? 1 : 0;
      const f = row / (ph - 1);
      const color = f < 0.2 ? "#ffffff" : f < 0.55 ? "#ece2f6" : f < 0.8 ? "#d4c6ea" : "#a894cc";
      rect(c, left + cut, py + row, pw - cut * 2, 1, color);
      if (f >= 0.4 && f < 0.6) for (let x = left + cut; x < left + pw - cut; x++) if (dither(x, py + row, 0.4)) rect(c, x, py + row, 1, 1, "#d4c6ea");
    }
    // El neón está a la izquierda: tiñe de rosado ese borde.
    rect(c, left, py + 1, 1, ph - 2, "#ffc9e6");
    rect(c, left + pw - 1, py + 1, 1, ph - 2, "#9a88c0");
    rect(c, left + 2, py + (ph >> 1), pw - 4, 1, "#d8cce8");
  }
  const cush = Math.max(4, Math.round(pw * 0.42));
  const cy0 = py + ph - Math.round(cush * 0.6);
  for (let row = 0; row < cush; row++) {
    const cut = row === 0 || row === cush - 1 ? 1 : 0;
    rect(c, bx - (cush >> 1) + cut, cy0 + row, cush - cut * 2, 1, row === 0 ? "#f0a0d0" : row >= cush - 1 ? "#7a2a68" : "#c25ea8");
  }
  rect(c, bx - (cush >> 1), cy0 + 1, 1, cush - 2, "#e488c4");
  // El frente del edredón cae hasta casi el piso, con pliegues suaves.
  const half = spanAt(bFront);
  rect(c, bx - half, bFront, half * 2, 1, "#b0589a");
  for (let y = bFront + 1; y <= bFront + bf; y++) {
    for (let x = bx - half; x < bx + half; x++) {
      const fold = Math.sin((x - bx) * 0.7);
      rect(c, x, y, 1, 1, fold > 0.6 ? "#6a2a5a" : fold < -0.6 ? "#3e1236" : "#56204a");
    }
  }
  rect(c, bx - half, bFront + bf, half * 2, 1, "#2e0c2a");
  rect(c, bx - half + 1, bFront + bf + 1, 2, 2, "#1a0a14");
  rect(c, bx + half - 3, bFront + bf + 1, 2, 2, "#1a0a14");

  // Mesita de noche de madera, con su cajón y el tirador de bronce.
  const nx0 = nsx - (nsw >> 1);
  rect(c, nx0, nsBase - nsh, nsw, nsh, "#3a1e2a");
  rect(c, nx0, nsBase - nsh, nsw, 2, "#a0644e");
  rect(c, nx0, nsBase - nsh + 2, nsw, 1, "#5e3442");
  rect(c, nx0 + 1, nsBase - nsh + Math.round(nsh * 0.25), nsw - 2, Math.round(nsh * 0.35), "#48263a");
  rect(c, nx0 + 1, nsBase - nsh + Math.round(nsh * 0.25), nsw - 2, 1, "#6a3a4a");
  rect(c, nsx, nsBase - nsh + Math.round(nsh * 0.42), 1, 1, "#e0b46a");
  rect(c, nx0 + nsw - 1, nsBase - nsh + 2, 1, nsh - 2, "#24101a");
  rect(c, nx0 + 1, nsBase, 1, 1, "#1a0a14");
  rect(c, nx0 + nsw - 2, nsBase, 1, 1, "#1a0a14");
  // La lámpara: base de cerámica y una pantalla que brilla por dentro.
  const lampBase = nsBase - nsh;
  const vaseH = Math.round(nsw * 0.5);
  const vaseW = Math.max(3, Math.round(nsw * 0.3));
  for (let row = 0; row < vaseH; row++) {
    const w = row < 2 ? vaseW - 1 : vaseW + (row > vaseH * 0.4 && row < vaseH - 1 ? 1 : 0);
    rect(c, nsx - (w >> 1), lampBase - 1 - row, w, 1, "#d8c8e8");
    rect(c, nsx - (w >> 1) + w - 1, lampBase - 1 - row, 1, 1, "#8a78a8");
  }
  rect(c, nsx, shadeY + shadeH, 1, lampBase - vaseH - shadeY - shadeH, "#c89a5a");
  for (let row = 0; row < shadeH; row++) {
    const w = Math.round(nsw * 0.55 + (row / shadeH) * nsw * 0.4);
    const left = nsx - (w >> 1);
    rect(c, left, shadeY + row, w, 1, row === shadeH - 1 ? "#fff4c8" : "#ffd890");
    rect(c, left, shadeY + row, 1, 1, "#e8a85a");
    rect(c, left + w - 1, shadeY + row, 1, 1, "#c8884a");
  }
  rect(c, nsx - Math.round(nsw * 0.27), shadeY, Math.round(nsw * 0.55), 1, "#c8884a");

  // Plantas: junto al jacuzzi (si hay sitio) y al fondo, contra la pared.
  if (wide) plant(c, random, x1 + Math.round(jw * 0.13), deckTop + Math.round(dd * 0.4), Math.round(jw * 0.3));
  if (x0 > 22) plant(c, random, Math.round(x0 * 0.55), floorY + 8, Math.round(jw * 0.26));
  else plant(c, random, 9, floorY + 7, clamp(Math.round(jw * 0.3), 16, 26));

  // El jacuzzi. Primero la tarima de piedra vista desde arriba (más angosta al fondo).
  const inset = Math.round(dd * 0.15);
  for (let y = deckTop; y < deckTop + dd; y++) {
    const f = (y - deckTop) / dd;
    const i = Math.round(inset * (1 - f));
    rect(c, x0 + i, y, jw - i * 2, 1, f < 0.06 ? "#5a3a5e" : f > 0.75 ? "#a8809e" : "#8e6a8c");
  }
  // Vetas claras del mármol, en diagonal.
  for (let k = 0; k < jw / 6; k++) {
    let vx = x0 + inset + Math.floor(random() * (jw - inset * 2));
    let vy = deckTop + 2 + Math.floor(random() * (dd - 4));
    for (let step = 0; step < 4 + random() * 6 && vy < deckTop + dd - 1; step++) {
      rect(c, vx, vy, 1, 1, "#b894b4");
      vx += random() < 0.5 ? 1 : 2;
      vy += random() < 0.5 ? 1 : 0;
    }
  }
  // Juntas de las losas: hileras a lo ancho y otras que se abren hacia acá.
  const slab = clamp(Math.round(jw / 7), 8, 30);
  for (let y = deckTop + Math.round(dd / 3); y < deckTop + dd; y += Math.round(dd / 3)) {
    const i = Math.round(inset * (1 - (y - deckTop) / dd));
    rect(c, x0 + i, y, jw - i * 2, 1, "#6e4e70");
  }
  for (let k = slab; k < jw; k += slab) {
    const xb = x0 + k;
    line(c, Math.round(jx + (xb - jx) * (1 - (inset * 2) / jw)), deckTop + 1, xb, deckTop + dd - 1, 1, "#6e4e70");
  }
  // El agua tiñe de azul la piedra alrededor del hueco.
  haze(c, jx, wcy, rx * 1.3, ry * 1.9, "#6e8eaa", 0.5);
  // Canto de la tarima: brillo y sombra.
  rect(c, x0, deckTop + dd, jw, 1, "#d0b4d2");
  rect(c, x0, deckTop + dd + 1, jw, 1, "#5a3e60");

  // El frente de mosaico verde agua, con juntas oscuras y algún reflejo rosado del neón.
  const tile = clamp(Math.round(jw / 16), 4, 9);
  const faceTop = deckTop + dd + 2;
  for (let y = faceTop; y < jBase; y++) {
    for (let x = x0; x < x1; x++) {
      const tx = (x - x0) % tile;
      const ty = (y - faceTop) % tile;
      const id = Math.floor((x - x0) / tile) * 31 + Math.floor((y - faceTop) / tile);
      let color = hash(id) < 0.5 ? "#123a4a" : "#164452";
      if (tx === 0 || ty === 0) color = "#081c26";
      else if (tx === 1 && ty === 1) color = hash(id + 7) < 0.18 ? "#9a4a86" : "#2a6a78";
      rect(c, x, y, 1, 1, color);
      // Más abajo, menos luz.
      if (dither(x, y, ((y - faceTop) / (jBase - faceTop)) * 0.5)) rect(c, x, y, 1, 1, "#0a2230");
    }
  }
  // Una tira de luz cian bajo el canto, como un led escondido.
  rect(c, x0, faceTop, jw, 1, "#3fc8d8");
  // El escalón de madera delante, al centro.
  const stepW = Math.round(jw * 0.46);
  const stepTop = jBase - Math.round(jf * 0.3);
  const stepFront = Math.min(height - 2, jBase + Math.max(2, Math.round(jf * 0.2)));
  rect(c, jx - (stepW >> 1), stepTop, stepW, 2, "#9a6a50");
  rect(c, jx - (stepW >> 1), stepTop, stepW, 1, "#c08a64");
  for (let y = stepTop + 2; y <= stepFront; y++) {
    rect(c, jx - (stepW >> 1), y, stepW, 1, (y - stepTop) % 3 === 0 ? "#3e2018" : "#5a3428");
  }
  rect(c, x0 - 1, jBase, jw + 2, 1, "#0a0408");
  for (let x = x0 - 2; x < x1 + 2; x++) if (dither(x, jBase + 1, 0.5)) rect(c, x, jBase + 1, 1, 1, "#0a0408");

  // El hueco de la tina: el borde, la pared de adentro (que se ve al fondo) y el agua.
  const inEllipse = (x: number, y: number, cx: number, cy: number, ax: number, ay: number) => ((x - cx) / ax) ** 2 + ((y - cy) / ay) ** 2 <= 1;
  const drop = Math.max(1, Math.round(ry * 0.35));
  const waterXs: number[] = [];
  const waterYs: number[] = [];
  for (let y = wcy - ry - 2; y <= wcy + ry + 2; y++) {
    for (let x = jx - rx - 3; x <= jx + rx + 3; x++) {
      if (!inEllipse(x, y, jx, wcy, rx + 2, ry + 1.2)) continue;
      if (!inEllipse(x, y, jx, wcy, rx, ry)) {
        // El borde redondeado: más oscuro al fondo, con brillo del lado de acá.
        rect(c, x, y, 1, 1, y > wcy ? "#d8c0d8" : "#4a3452");
        continue;
      }
      if (!inEllipse(x, y, jx, wcy + drop, rx, ry)) {
        // La pared de adentro, al fondo: más clara cerca del agua.
        rect(c, x, y, 1, 1, y >= wcy - ry + drop ? "#1e7a96" : "#104660");
        continue;
      }
      // El agua: encendida desde el centro (la luz está en el fondo de la tina).
      const d = Math.hypot((x - jx) / rx, (y - wcy - drop * 0.5) / ry);
      const v = clamp(d * 1.25, 0, 0.999) * (WATER.length - 1);
      const level = Math.floor(v);
      rect(c, x, y, 1, 1, WATER[clamp(level + (dither(x, y, v - level) ? 1 : 0), 0, WATER.length - 1)]);
      waterXs.push(x);
      waterYs.push(y);
    }
  }

  // Velas: tres altas al fondo a la izquierda, una baja adelante y dos al otro lado.
  const candles: Candle[] = [];
  const candleW = big ? 3 : 2;
  const candle = (x: number, base: number, tall: number) => {
    rect(c, x, base - tall, candleW, tall, "#f4e6d8");
    rect(c, x + candleW - 1, base - tall, 1, tall, "#cdb2b0");
    rect(c, x, base - tall, candleW, 1, "#fff6ea");
    rect(c, x, base, candleW, 1, "#4a3452");
    candles.push({ x: x + (candleW >> 1) - 1, y: base - tall - 1, big, phase: random() * 6.28 });
  };
  const k = big ? 1.6 : 1;
  for (const [dx, tall] of [[0, 7], [candleW + 2, 5], [candleW * 2 + 4, 6]] as const) {
    haze(c, x0 + inset + 3 + dx, deckTop + 2 - tall * k, 8 * k, 7 * k, "#7a4a5a", 0.4);
  }
  for (const [dx, tall] of [[0, 7], [candleW + 2, 5], [candleW * 2 + 4, 6]] as const) {
    candle(x0 + inset + 2 + dx, deckTop + 3 + (dx ? 1 : 0), Math.round(tall * k));
  }
  candle(x0 + 3, deckTop + dd - 3, Math.round(2 * k));
  candle(x1 - 4 - candleW * 2, deckTop + dd - 3, Math.round(2 * k));
  candle(x1 - 2 - candleW, deckTop + dd - 4, Math.round(3 * k));

  // Toallas dobladas al fondo a la derecha: una blanca y una rosada encima.
  const towW = clamp(Math.round(jw * 0.16), 8, 32);
  const towH = big ? 4 : 3;
  const towX = x1 - inset - towW - 2;
  const towBase = deckTop + Math.round(dd * 0.32);
  const towel = (y: number, light: string, mid: string, dark: string) => {
    rect(c, towX + 1, y, towW - 1, 1, light);
    rect(c, towX, y + 1, towW, towH - 2, mid);
    rect(c, towX + 1, y + towH - 1, towW - 1, 1, dark);
    rect(c, towX, y + 1, 1, towH - 2, light);
    // La orilla de la toalla, con su franja tejida.
    rect(c, towX + towW - 3, y, 1, towH, dark);
  };
  towel(towBase - towH, "#ffffff", "#e6dcec", "#9a88a8");
  towel(towBase - towH * 2, "#ffd0ea", "#e48abe", "#9a3a7e");
  rect(c, towX + 1, towBase, towW - 1, 1, "#3a2442");

  /* ===== Delante: una sombra suave en los bordes, como si la luz no llegara. ===== */
  const front = layer(width, height);
  c = front.c;
  c.fillStyle = "#0a020c";
  const edge = clamp(Math.round(width * 0.05), 6, 22);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fromSide = Math.min(x, width - 1 - x) / edge;
      const fromBottom = (height - 1 - y) / edge;
      const near = Math.min(fromSide, fromBottom);
      if (near < 1 && dither(x, y, (1 - near) * 0.45)) c.fillRect(x, y, 1, 1);
    }
  }

  /* ===== Lo que se mueve. ===== */
  const streaks: Streak[] = Array.from({ length: Math.round((gw * gh) / 110) + 4 }, () => ({
    x: random() * gw,
    y: random() * gh,
    speed: 38 + random() * 26,
    length: 2 + Math.floor(random() * 3),
  }));
  const drops: Drop[] = Array.from({ length: Math.round((gw * gh) / 260) + 3 }, () => ({
    x: Math.floor(random() * gw),
    start: random() * gh,
    speed: 1.5 + random() * 4,
    trail: 3 + Math.floor(random() * 7),
    phase: random() * 6.28,
  }));
  const bubbles: Bubble[] = Array.from({ length: clamp(Math.round((rx * ry) / 10), 6, 34) }, () => ({ period: 2.4 + random() * 2.6, offset: random() * 10 }));
  const jets = [jx - rx + 3, jx + rx - 4];
  const jetY = wcy + drop;
  const candleGlow = candles;

  // Hilos de vapor: cada uno sube desde el agua, se mece y se deshace arriba.
  const rise = wcy - (floorY - Math.round(floorY * 0.3));
  const wisps: Wisp[] = Array.from({ length: clamp(Math.round(jw / 14), 4, 18) }, () => ({
    spread: 2 + random() * (2 + jw * 0.03),
    x: jx + (random() * 2 - 1) * rx * 0.8,
    tall: rise * (0.55 + random() * 0.45),
    sway: 2 + random() * (3 + jw * 0.03),
    phase: random() * 6.28,
    drift: (random() - 0.5) * jw * 0.25,
  }));

  // Los reflejos del agua en la pared: dónde y con cuánta fuerza.
  const cauX0 = jx - Math.round(jw * 0.52);
  const cauX1 = jx + Math.round(jw * 0.52);
  const cauY0 = floorY - Math.round(Math.min(floorY * 0.36, jw * 0.48));
  const cauY1 = floorY - 5;

  return {
    world: 5,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      target.drawImage(back.canvas, 0, 0);

      // La ciudad: algunas ventanas se prenden y se apagan; la antena parpadea.
      for (const light of lights) {
        if (!still && Math.sin(t * light.speed * 6.28 + light.phase) < -0.3) rect(target, light.x, light.y, 1, 1, "#1e1640");
      }
      for (const beacon of beacons) {
        const on = still || Math.floor(time / 1300) % 2 === 0;
        rect(target, beacon.x, beacon.y, 1, 1, on ? "#ff4a5a" : "#5a1a2a");
        if (on) {
          rect(target, beacon.x - 1, beacon.y, 1, 1, "#6a1a34");
          rect(target, beacon.x + 1, beacon.y, 1, 1, "#6a1a34");
        }
      }

      // La lluvia de afuera, en rayitas que bajan un poco inclinadas.
      target.fillStyle = "#3e4c8c";
      for (const streak of streaks) {
        const y = Math.round(wrap(streak.y + t * streak.speed, gh + streak.length)) - streak.length;
        const x = Math.round(wrap(streak.x - (streak.y + t * streak.speed) * 0.2, gw));
        for (let k = 0; k < streak.length; k++) {
          const py = y + k;
          const px = x - (k >> 1);
          if (py >= 0 && py < gh && px >= 0 && px < gw) target.fillRect(gx0 + px, gy0 + py, 1, 1);
        }
      }
      // Gotas que resbalan por el vidrio, serpenteando y dejando su caminito.
      for (const d of drops) {
        const y = Math.round(wrap(d.start + t * d.speed, gh + d.trail)) - 1;
        const sway = (yy: number) => d.x + Math.round(Math.sin(yy * 0.3 + d.phase) * 0.8);
        for (let k = 1; k <= d.trail; k++) {
          const yy = y - k;
          if (yy >= 0 && yy < gh && k % 2 === 1) rect(target, gx0 + clamp(sway(yy), 0, gw - 1), gy0 + yy, 1, 1, "#3e4c90");
        }
        if (y >= 0 && y < gh) rect(target, gx0 + clamp(sway(y), 0, gw - 1), gy0 + y, 1, 1, "#d2e2ff");
        if (y + 1 >= 0 && y + 1 < gh) rect(target, gx0 + clamp(sway(y + 1), 0, gw - 1), gy0 + y + 1, 1, 1, "#7a8cd0");
      }

      // Reflejos del agua en la pared: una red de luz que tiembla despacio.
      for (let y = cauY0; y < cauY1; y++) {
        const fy = (y - cauY0) / (cauY1 - cauY0);
        for (let x = cauX0; x <= cauX1; x++) {
          const fx = 1 - Math.abs(x - jx) / (cauX1 - jx + 1);
          const strength = fy * fx;
          if (strength < 0.1) continue;
          const v = Math.sin(x * 0.29 + t * 0.9 + Math.sin(y * 0.23 - t * 0.6) * 2.2) + Math.sin(y * 0.37 + t * 0.7 + x * 0.11);
          if (v < 1.62 - strength * 0.35) continue;
          if (!dither(x, y, strength * 1.3)) continue;
          rect(target, x, y, 1, 1, v > 1.85 ? "#4a7aa0" : "#2c3e6c");
        }
      }

      // La X del letrero falla a veces: dos parpadeos cortos cada tanto.
      if (!still) {
        const moment = time % 11000;
        if ((moment > 6200 && moment < 6320) || (moment > 6450 && moment < 6520) || (moment > 6700 && moment < 6760)) {
          target.drawImage(sign.off.canvas, sign.x, sign.y);
        }
      }

      target.drawImage(middle.canvas, 0, 0);

      // El agua ondula: crestas claras que viajan, valles más hondos y el neón reflejado al fondo.
      const waterTop = wcy - ry + drop;
      for (let index = 0; index < waterXs.length; index++) {
        const x = waterXs[index];
        const y = waterYs[index];
        const v = Math.sin(x * 0.42 + t * 1.6 + Math.sin(y * 0.9 + t * 0.8) * 1.5) + Math.sin(x * 0.17 - t * 0.9 + y * 0.6);
        if (v > 1.62) rect(target, x, y, 1, 1, "#effffe");
        else if (v > 1.3) rect(target, x, y, 1, 1, "#b0fbff");
        else if (v < -1.7) rect(target, x, y, 1, 1, "#1d98b8");
        else if (y - waterTop < ry * 0.6 && v > 0.9 && Math.abs(x - jx) < rx * 0.5) rect(target, x, y, 1, 1, "#ff9fd0");
      }

      // Los chorros: espuma que se revuelve y burbujitas que corren hacia el centro.
      for (let side = 0; side < 2; side++) {
        const jxp = jets[side];
        const dir = side === 0 ? 1 : -1;
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9 + t * 2.2 * (side ? -1 : 1);
          const r = 1 + (k % 3) * 0.8;
          rect(target, Math.round(jxp + Math.cos(a) * r * 1.4), Math.round(jetY + Math.sin(a) * r * 0.6), 1, 1, k % 2 ? "#f2ffff" : "#bff8ff");
        }
        for (let k = 0; k < 4; k++) {
          const along = wrap(t * 6 + k * rx * 0.17, rx * 0.65);
          const x = Math.round(jxp + dir * (2 + along));
          const y = jetY + Math.round(Math.sin(t * 3 + k * 1.7) * 0.8);
          rect(target, x, y, 1, 1, "#e0feff");
        }
      }

      // Burbujas: nacen, crecen, revientan y vuelven a salir en otro lado.
      for (let index = 0; index < bubbles.length; index++) {
        const b = bubbles[index];
        const phase = t / b.period + b.offset;
        const cycle = Math.floor(phase);
        const p = phase - cycle;
        const x = Math.round(jx + (hash(index * 13 + cycle * 7.1) * 2 - 1) * rx * 0.72);
        const y = Math.round(wcy + drop * 0.5 + (hash(index * 29 + cycle * 3.3) * 2 - 1) * (ry - drop) * 0.6);
        if (p < 0.5) rect(target, x, y, 1, 1, "#c8fdff");
        else if (p < 0.78) {
          rect(target, x, y - 1, 1, 1, "#ffffff");
          rect(target, x - 1, y, 1, 1, "#e8ffff");
          rect(target, x + 1, y, 1, 1, "#9ef4fa");
          if (s > 1) rect(target, x, y + 1, 1, 1, "#9ef4fa");
        } else if (p < 0.88) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) rect(target, x + dx * s, y + dy, 1, 1, "#f2ffff");
        }
      }

      // Las llamas de las velas tiemblan.
      for (const candle of candleGlow) {
        const n = Math.sin(t * 6.1 + candle.phase) + Math.sin(t * 9.7 + candle.phase * 2);
        const frame = still ? 0 : n > 1.2 ? 1 : n < -1.2 ? 2 : Math.sin(t * 2.3 + candle.phase) > 0.97 ? 3 : 0;
        const sprite = (candle.big ? BIG_FLAMES : FLAMES)[frame];
        paintSprite(target, sprite, FLAME_COLORS, candle.x, candle.y - sprite.length + 1);
      }

      // El vapor sube despacio: cada hilo se mece, se ensancha al subir y por él
      // pasan franjas más densas. Va en tonos lila apagados, cercanos a la pared,
      // para que el tramado se vea como niebla y no como puntos.
      const steamFrom = wcy - Math.round(ry * 0.3);
      for (let pass = 0; pass < 2; pass++) {
        target.fillStyle = pass === 0 ? "#553468" : "#b292c2";
        for (const wisp of wisps) {
          for (let h = 0; h < wisp.tall; h++) {
            const f = h / wisp.tall;
            const fade = f < 0.12 ? f / 0.12 : 1 - (f - 0.12) / 0.88;
            const band = 0.5 + 0.5 * Math.sin(h * 0.11 - t * 1.2 + wisp.phase * 2);
            const amount = fade * (0.35 + band * 0.65) * 0.85;
            if (amount < 0.04) continue;
            const y = steamFrom - h;
            const cx = Math.round(
              wisp.x + Math.sin(h * 0.08 - t * 0.8 + wisp.phase) * wisp.sway * (0.3 + f) + Math.sin(h * 0.19 + t * 0.4 + wisp.phase) * 1.2 + wisp.drift * f * f,
            );
            const spread = 1 + Math.round(f * wisp.spread);
            const core = Math.max(0, Math.round(spread * 0.35));
            for (let dx = -spread; dx <= spread; dx++) {
              const inner = Math.abs(dx) <= core;
              if (inner !== (pass === 1)) continue;
              if (dither(cx + dx, y, amount * (1 - Math.abs(dx) / (spread + 1)) * (inner ? 0.8 : 1))) target.fillRect(cx + dx, y, 1, 1);
            }
          }
        }
      }

      target.drawImage(front.canvas, 0, 0);
    },
  };
}
