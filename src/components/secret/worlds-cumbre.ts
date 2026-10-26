/**
 * Mundo 4 · LA CUMBRE NEVADA.
 *
 * Una noche clara en lo alto de la montaña. El cielo es azul índigo, lleno de
 * estrellas, y por él pasan dos cintas de aurora (verde agua y violeta) que
 * ondulan muy despacio. Detrás hay dos cordilleras nevadas: la lejana, pálida
 * y azulada; la cercana, con un pico grande a un lado y las crestas que miran a
 * la luna encendidas de blanco. Delante, lomas de nieve, pinos cargados de
 * nieve, un santuario pequeñito medio enterrado con un farol encendido (el único
 * punto cálido de todo el paisaje), huellas que llegan hasta él y un espíritu
 * tímido que se asoma detrás de un pino. Cae nieve a tres distancias y a ras
 * del suelo pasa una ventisca suave.
 *
 * Igual que en worlds.ts: lo quieto se pinta una vez en capas (cielo, montañas,
 * frente) y en cada cuadro solo se copian y se dibuja lo que se mueve.
 */

import { GHOST, GHOST_COLORS, clamp, dither, paintSprite, rect, seeded, type Colors, type Ctx, type Sprite } from "./art";
import { disc, glow, layer, peaks, places, scatterStars, sky, twinkle, wrap, type Layer, type Scene } from "./scenery";

/* ---------- Colores ---------- */

const SUMMIT_SKY = ["#04071a", "#070c25", "#0b1231", "#10193f", "#16214c", "#1d2a59", "#263566", "#314274"];
const SUMMIT_STOPS = [0, 0.15, 0.29, 0.43, 0.56, 0.68, 0.8, 0.9];

/** Cómo se ve una cordillera: roca y nieve, del lado de la luna y del lado de la sombra. */
type RangeLook = {
  rockLit: string;
  rockShade: string;
  snowLit: string;
  snowShade: string;
  /** Canalones y grietas dentro de la nieve. */
  gully: string;
  /** Filo de la cresta que mira a la luna. */
  crest: string;
  /** Filo de la cresta en sombra (apenas se distingue del cielo). */
  ridge: string;
  /** Neblina del pie de la montaña: la que la separa de lo que tiene delante. */
  haze: string;
  /** Desde qué altura (en píxeles sobre la base) empieza la nieve. */
  snowAlt: number;
  hazeRows: number;
};

/** Pino cargado de nieve: aguja oscura, nieve con luz y nieve en sombra. */
type PineLook = { needle: string; needleLit: string; snowLit: string; snowShade: string; trunk: string };

const PINE_NEAR: PineLook = { needle: "#0b1d2c", needleLit: "#17384a", snowLit: "#eef4ff", snowShade: "#93a6d6", trunk: "#140e1c" };
const PINE_MID: PineLook = { needle: "#13254a", needleLit: "#1e3a5c", snowLit: "#c7d4f6", snowShade: "#6d7db6", trunk: "#111a38" };
const PINE_FAR: PineLook = { needle: "#1c2a58", needleLit: "#24366a", snowLit: "#8f9fd2", snowShade: "#55639e", trunk: "#1c2a58" };

/** El farol del santuario: papel y madera, con la llama blanca en el centro. */
const HANGING_LANTERN: Sprite = ["..k..", ".kkk.", "koook", "koyok", "kyWyk", "koyok", "koook", ".kkk.", "..k.."];
const HANGING_COLORS: Colors = { k: "#26141a", o: "#ff9a3c", y: "#ffd06a", W: "#fff4c8" };

/* ---------- Herramientas de este paisaje ---------- */

/** Ruido fijo: el mismo número da siempre lo mismo (para grietas y bordes que no cambien). */
const hash = (x: number, y = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Una cordillera nevada. La luna está a la derecha, así que la ladera que baja
 * hacia la derecha recibe luz y la otra queda en sombra azulada. Arriba de cierta
 * altura todo es nieve; abajo asoma la roca, y al pie hay neblina.
 */
function snowRange(c: Ctx, heights: readonly number[], base: number, look: RangeLook, seed: number) {
  // Qué columnas llevan canalón, calculado una vez (el ruido es caro si se repite en cada píxel).
  const margin = base;
  const gullies = Array.from({ length: heights.length + margin * 2 }, (_, index) => hash(index - margin, seed + 5) < 0.17);
  for (let x = 0; x < heights.length; x++) {
    const h = heights[x];
    if (h < 1) continue;
    const top = base - h;
    // Se mira la pendiente en un tramo de varias columnas, no solo en las vecinas,
    // para que un escaloncito suelto no pinte toda la columna del otro color.
    const left = heights[x - 3] ?? heights[0];
    const right = heights[x + 3] ?? heights[heights.length - 1];
    const lit = left > right || (left === right && (heights[x - 1] ?? h) >= (heights[x + 1] ?? h));
    // La línea de nieve sube y baja un poco para que no parezca cortada con regla.
    const snowLine = look.snowAlt + 4 * Math.sin(x * 0.19 + seed) + 3 * Math.sin(x * 0.47 + seed * 2) + hash(x, seed) * 3;
    const dir = lit ? 1 : -1;
    // Los píxeles seguidos del mismo color se pintan de un solo trazo (mucho más rápido).
    let run = top;
    let runColor = "";
    for (let y = top; y < base; y++) {
      const alt = base - y;
      const depth = y - top;
      const snow = alt > snowLine + 2 || (alt > snowLine - 3 && dither(x, y, (alt - snowLine + 3) / 6));
      // Canalones: líneas que bajan en diagonal por la ladera, como en las montañas de verdad.
      const gully = depth > 2 && gullies[Math.round(x - dir * depth * 0.55) + margin] && dither(x, y, 0.8);
      let color: string;
      if (depth === 0 || (lit && depth === 1)) color = snow ? (lit ? look.crest : look.ridge) : lit ? look.snowShade : look.rockLit;
      else if (snow) color = lit ? (gully ? look.snowShade : look.snowLit) : gully ? look.gully : look.snowShade;
      else color = lit ? (gully ? look.rockShade : look.rockLit) : look.rockShade;
      if (alt < look.hazeRows && dither(x, y, (1 - alt / look.hazeRows) * 0.85)) color = look.haze;
      if (color !== runColor) {
        if (runColor) rect(c, x, run, 1, y - run, runColor);
        run = y;
        runColor = color;
      }
    }
    if (runColor) rect(c, x, run, 1, base - run, runColor);
  }
}

/**
 * Pino con nieve: copa en pisos que se abren hacia abajo; encima de cada piso se
 * acumula nieve (más clara del lado de la luna) y de las puntas cuelga un poco.
 */
function pine(c: Ctx, x: number, base: number, tall: number, look: PineLook) {
  const tier = Math.max(3, Math.round(tall / 6));
  const trunk = Math.max(2, Math.round(tall / 9));
  rect(c, x - (tall > 24 ? 1 : 0), base - trunk, tall > 24 ? 3 : 1, trunk, look.trunk);
  const top = base - trunk - tall;
  for (let row = 0; row < tall; row++) {
    const floor = Math.floor(row / tier);
    const inside = row % tier;
    const half = Math.floor(floor * (tall > 24 ? 1.5 : 1) + inside * (tall > 24 ? 0.9 : 0.7));
    const y = top + row;
    rect(c, x - half, y, half * 2 + 1, 1, look.needle);
    // El lado derecho mira a la luna.
    rect(c, x + 1, y, Math.max(0, half - 1), 1, look.needleLit);
    if (inside <= 1 && half > 0) {
      // Nieve sobre el piso: la fila de arriba entera, la segunda solo hacia el centro.
      const span = inside === 0 ? half : Math.max(0, half - 2);
      rect(c, x - span, y, span, 1, look.snowShade);
      rect(c, x, y, span + 1, 1, look.snowLit);
    }
    if (inside === tier - 1 && half > 1) {
      // Puntas de las ramas, caídas por el peso de la nieve.
      rect(c, x - half - 1, y, 1, 1, look.snowShade);
      rect(c, x + half + 1, y, 1, 1, look.snowLit);
      rect(c, x - half - 1, y + 1, 1, 1, look.needle);
      rect(c, x + half + 1, y + 1, 1, 1, look.needle);
    }
  }
  rect(c, x, top - 1, 1, 1, look.snowLit);
  return { top, half: Math.floor((Math.floor((tall - 1) / tier) * (tall > 24 ? 1.5 : 1)) + (tier - 1) * (tall > 24 ? 0.9 : 0.7)) };
}

/** Una loma de nieve: brilla en la cresta, se oscurece hacia abajo, con alguna onda de viento. */
function snowBank(
  c: Ctx,
  width: number,
  height: number,
  surface: (x: number) => number,
  colors: { crest: string; light: string; body: string; deep: string },
) {
  // Se pinta por pasadas de un mismo color: cambiar de color a cada píxel es lo que más cuesta.
  const tops = Array.from({ length: width }, (_, x) => surface(x));
  const shine = tops.map((_, x) => surface(x - 1) > surface(x + 1));
  const lit = (x: number) => shine[x];
  c.fillStyle = colors.body;
  for (let x = 0; x < width; x++) c.fillRect(x, tops[x], 1, height - tops[x]);
  c.fillStyle = colors.light;
  for (let x = 0; x < width; x++) {
    const top = tops[x];
    const strength = lit(x) ? 0.9 : 0.5;
    if (!lit(x)) c.fillRect(x, top, 1, 1);
    for (let y = top + 1; y < Math.min(height, top + 6); y++) if (dither(x, y, ((top + 6 - y) / 6) * strength)) c.fillRect(x, y, 1, 1);
  }
  c.fillStyle = colors.crest;
  for (let x = 0; x < width; x++) if (lit(x)) c.fillRect(x, tops[x], 1, 1);
  // Hacia abajo la nieve se va sombreando; donde el tramado ya no cambia, se rellena con un patrón.
  c.fillStyle = colors.deep;
  const fade = 19;
  for (let x = 0; x < width; x++) {
    for (let y = tops[x] + 6; y < Math.min(height, tops[x] + 6 + fade); y++) if (dither(x, y, (y - tops[x] - 6) / 26)) c.fillRect(x, y, 1, 1);
  }
  const tile = layer(4, 4);
  tile.c.fillStyle = colors.deep;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (dither(x, y, 0.7)) tile.c.fillRect(x, y, 1, 1);
  const pattern = c.createPattern(tile.canvas, "repeat");
  if (pattern) {
    c.fillStyle = pattern;
    for (let x = 0; x < width; x++) if (tops[x] + 6 + fade < height) c.fillRect(x, tops[x] + 6 + fade, 1, height - tops[x] - 6 - fade);
  }
  // Ondas que deja el viento en la nieve: rayitas claras con su sombra debajo.
  for (let y = 0; y < height; y += 4) {
    for (let x = (y * 3) % 7; x < width; x += 7) {
      if (hash(x, y) > 0.22 || y < surface(x) + 5) continue;
      const length = 3 + Math.floor(hash(y, x) * 5);
      rect(c, x, y, length, 1, colors.light);
      rect(c, x + 1, y + 1, length, 1, colors.deep);
    }
  }
}

/** Sombra que la luna (a la derecha) echa de un pino sobre la nieve: se alarga hacia la izquierda. */
function pineShadow(c: Ctx, x: number, base: number, length: number, color: string) {
  c.fillStyle = color;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dx = -length; dx <= 3; dx++) {
      const along = dx < 0 ? -dx / length : 0;
      const thick = 1 - Math.abs(dy - 0.5) / 2.2;
      if (dither(x + dx, base + dy, (1 - along) * thick * 0.9)) c.fillRect(x + dx, base + dy, 1, 1);
    }
  }
}

/* ---------- El santuario ---------- */

/**
 * Santuario de montaña: una casita de madera sobre piedras, con techo a dos
 * aguas enterrado en nieve, carámbanos y un farol colgado del alero derecho.
 * Devuelve dónde quedó el farol para pintarlo encendido en cada cuadro.
 */
function mountainShrine(c: Ctx, cx: number, base: number) {
  const stone = "#424c7c";
  const stoneLit = "#7c89c0";
  const stoneDark = "#262c52";
  const wood = "#3a2436";
  const woodDark = "#1f121d";
  const woodLit = "#6b4252";

  // Base de piedras.
  rect(c, cx - 14, base - 5, 29, 5, stone);
  rect(c, cx - 14, base - 5, 29, 1, stoneLit);
  for (let x = cx - 12; x < cx + 14; x += 6) rect(c, x, base - 4, 1, 4, stoneDark);
  rect(c, cx - 14, base - 1, 29, 1, stoneDark);
  rect(c, cx + 14, base - 5, 1, 5, stoneDark);

  // Cuerpo de madera, con dos postes y la puerta abierta.
  const bodyTop = base - 20;
  rect(c, cx - 10, bodyTop, 21, 15, wood);
  rect(c, cx - 10, bodyTop, 2, 15, woodDark);
  rect(c, cx + 9, bodyTop, 2, 15, woodDark);
  rect(c, cx + 10, bodyTop, 1, 15, woodLit);
  for (let y = bodyTop + 3; y < base - 5; y += 3) rect(c, cx - 8, y, 17, 1, "#2e1b2b");
  // Puerta: por dentro brilla una vela.
  rect(c, cx - 4, bodyTop + 4, 9, 11, "#140a12");
  rect(c, cx - 3, bodyTop + 9, 7, 6, "#3a1e1c");
  for (let y = bodyTop + 5; y < bodyTop + 15; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) if (dither(x, y, (y - bodyTop - 5) / 14)) rect(c, x, y, 1, 1, "#6b3524");
  }
  rect(c, cx, bodyTop + 11, 1, 3, "#ffe7b0");
  rect(c, cx, bodyTop + 10, 1, 1, "#ffb347");
  rect(c, cx - 4, bodyTop + 4, 9, 1, woodLit);

  // Techo a dos aguas con la nieve encima.
  const apex = bodyTop - 10;
  for (let row = 0; row <= 10; row++) {
    const half = 3 + Math.round(row * 1.45);
    const y = apex + row;
    rect(c, cx - half, y, half * 2 + 1, 1, row === 10 ? woodDark : "#2a1828");
    rect(c, cx + 1, y, half, 1, row === 10 ? woodDark : "#3d2538");
  }
  rect(c, cx - 18, bodyTop, 37, 1, "#120a12");
  for (let x = cx - 18; x <= cx + 18; x++) {
    const dx = x - cx;
    // Altura del techo en esta columna y un colchón de nieve redondeado encima.
    const roof = apex + Math.max(0, Math.round((Math.abs(dx) - 3) / 1.45));
    const pile = 3 + Math.round(1.6 * Math.cos((dx / 18) * Math.PI * 0.5)) + (hash(x, 9) < 0.3 ? 1 : 0);
    for (let y = roof - pile; y < roof + 1; y++) {
      const edge = y === roof - pile;
      rect(c, x, y, 1, 1, dx >= 0 ? (edge ? "#ffffff" : "#e3ebff") : edge ? "#c9d6f6" : "#a3b4e0");
    }
    // Carámbanos en los aleros.
    if (Math.abs(dx) > 11 && hash(x, 3) < 0.55) rect(c, x, bodyTop + 1, 1, 1 + Math.floor(hash(x, 4) * 3), "#bcd0ff");
  }
  rect(c, cx - 19, bodyTop - 1, 1, 2, "#a3b4e0");
  rect(c, cx + 19, bodyTop - 1, 1, 2, "#e3ebff");
  // Nieve amontonada contra la base.
  for (let x = cx - 17; x <= cx + 17; x++) {
    const pile = Math.round(3 - Math.abs(x - cx) / 7 + hash(x, 7) * 2);
    rect(c, x, base - pile, 1, pile, x > cx ? "#c7d3f5" : "#8e9dd1");
  }

  // Cordón y farol, colgados del alero derecho.
  const lanternX = cx + 15;
  rect(c, lanternX, bodyTop + 1, 1, 3, "#1a1018");
  return { x: lanternX - 2, y: bodyTop + 4 };
}

/* ---------- La aurora ---------- */

/**
 * Una cinta de aurora pintada una vez en una tira tan ancha como el paisaje:
 * abajo un borde brillante, encima un velo que se apaga y cambia de color, con
 * rayos verticales. Las ondas usan vueltas enteras para que la tira empalme
 * consigo misma cuando se desliza.
 */
function auroraStrip(width: number, tall: number, colors: readonly string[], random: () => number, strength: number, alpha: number): Layer {
  const strip = layer(width, tall);
  // La transparencia queda pintada en la tira, para no tener que aplicarla en cada cuadro.
  strip.c.globalAlpha = alpha;
  const phases = [random() * 6.28, random() * 6.28, random() * 6.28, random() * 6.28];
  const turn = (k: number, x: number, phase: number) => Math.sin((Math.PI * 2 * k * x) / width + phase);
  const [edge, bright, mid, high] = colors;
  const rayTurns = Math.max(6, Math.round(width / 16));
  for (let x = 0; x < width; x++) {
    // Qué tan intensa es la cortina en esta columna, y hasta dónde sube su rayo.
    const body = clamp(0.6 + 0.28 * turn(2, x, phases[0]) + 0.18 * turn(5, x, phases[1]), 0, 1);
    const ray = 0.5 + 0.5 * turn(rayTurns, x, phases[2]) * (0.6 + 0.4 * turn(3, x, phases[3]));
    const reach = tall * (0.3 + 0.7 * ray * body);
    let current = "";
    for (let y = 0; y < tall; y++) {
      const rise = tall - 1 - y;
      if (rise > reach) continue;
      // Se apaga hacia arriba; abajo, un borde más vivo.
      const fade = Math.pow(1 - rise / reach, 1.4);
      const color = rise < 2 ? edge : rise < tall * 0.3 ? bright : rise < tall * 0.6 ? mid : high;
      const amount = rise < 2 ? body * 0.85 : fade * body * 0.8;
      if (!dither(x, y, amount * strength)) continue;
      if (color !== current) strip.c.fillStyle = current = color;
      strip.c.fillRect(x, y, 1, 1);
    }
  }
  strip.c.globalAlpha = 1;
  return strip;
}

type Ribbon = { strip: Layer; base: (x: number) => number; reach: number; pace: number; phase: number; drift: number };

/** Copia la tira columna por columna, subiendo y bajando cada una según una onda lenta. */
function drawRibbon(target: Ctx, ribbon: Ribbon, width: number, t: number) {
  const tall = ribbon.strip.canvas.height;
  const shift = Math.round(t * ribbon.drift);
  for (let x = 0; x < width; x += 2) {
    const wave =
      ribbon.reach * Math.sin(x * 0.012 + t * ribbon.pace + ribbon.phase) +
      ribbon.reach * 0.45 * Math.sin(x * 0.037 - t * ribbon.pace * 0.7 + ribbon.phase * 2);
    const y = Math.round(ribbon.base(x) + wave) - tall;
    const source = wrap(x + shift, width);
    const span = Math.min(2, width - source, width - x);
    target.drawImage(ribbon.strip.canvas, source, 0, span, tall, x, y, span, tall);
  }
}

/* ---------- El paisaje ---------- */

type Flake = { x: number; y: number; fall: number; sway: number; reach: number; phase: number };

export function summit(width: number, height: number): Scene {
  const random = seeded(4404);
  const back = layer(width, height);
  const middle = layer(width, height);
  const front = layer(width, height);
  // Lo más cercano va en otra capa, para que el espíritu quede entre las dos (detrás de su pino).
  const nearby = layer(width, height);

  const ground = clamp(Math.round(height * 0.3), 58, 100);
  const horizon = height - ground;
  const place = places(width);
  const moon = {
    x: place.right,
    y: Math.max(26, Math.round(horizon * 0.15)),
    r: clamp(Math.round(Math.min(width, horizon) * 0.06), 6, 13),
  };

  /* Cielo: franjas índigo, estrellas y una luna pequeña y fría. */
  let c = back.c;
  sky(c, width, horizon, SUMMIT_SKY, SUMMIT_STOPS);
  rect(c, 0, horizon, width, height - horizon, SUMMIT_SKY[SUMMIT_SKY.length - 1]);
  const stars = scatterStars(c, random, width, Math.round(horizon * 0.85), 150, ["#7f8fd0", "#5b6ab0", "#b3c2f2", "#9fd8e8"], moon);
  glow(c, moon.x, moon.y, moon.r, moon.r + 10, "#24356e", 0.45);
  glow(c, moon.x, moon.y, moon.r, moon.r + 4, "#3f5598", 0.4);
  disc(c, moon.x, moon.y, moon.r, "#f4f8ff");
  disc(c, moon.x, moon.y, moon.r, "#cfdcf6", (dx, dy) => Math.hypot(dx + moon.r * 0.35, dy - moon.r * 0.3) < moon.r * 0.75 && dx < 0);
  disc(c, moon.x - Math.round(moon.r * 0.3), moon.y - Math.round(moon.r * 0.25), Math.max(1, Math.round(moon.r * 0.2)), "#d9e3f8");
  disc(c, moon.x + Math.round(moon.r * 0.3), moon.y + Math.round(moon.r * 0.35), Math.max(1, Math.round(moon.r * 0.15)), "#d9e3f8");

  /* Montañas: la cordillera lejana y la cercana con el pico grande. */
  c = middle.c;
  const farBase = horizon + 2;
  const far = peaks(random, width, horizon * 0.26, horizon * 0.44, 44);
  snowRange(
    c,
    far,
    farBase,
    {
      rockLit: "#3f4f88",
      rockShade: "#2f3c72",
      snowLit: "#8a9bd2",
      snowShade: "#56659f",
      gully: "#46558f",
      crest: "#b6c4ee",
      ridge: "#6574ad",
      haze: "#34457a",
      snowAlt: horizon * 0.14,
      hazeRows: 18,
    },
    11,
  );

  const midBase = horizon + 8;
  const near = peaks(random, width, horizon * 0.06, horizon * 0.2, 34);
  // El pico grande va a un lado (en pantallas anchas, fuera del tablero) y otro menor al otro.
  const summits = [
    { x: place.left, top: horizon * (place.wide ? 0.6 : 0.52), left: 0.95, right: 0.8 },
    { x: place.right + (place.wide ? 34 : 6), top: horizon * 0.34, left: 0.9, right: 1.0 },
  ];
  for (const peak of summits) {
    let bump = 0;
    for (let x = 0; x < width; x++) {
      const dx = x - peak.x;
      // Un camino al azar le da escalones y hombros a las laderas.
      bump = clamp(bump * 0.92 + (random() - 0.5) * 1.1, -4, 4);
      const height = peak.top - Math.abs(dx) * (dx < 0 ? peak.left : peak.right) + (Math.abs(dx) > 4 ? bump : 0);
      near[x] = Math.max(near[x], Math.floor(height));
    }
  }
  snowRange(
    c,
    near,
    midBase,
    {
      rockLit: "#2e3b74",
      rockShade: "#1a2250",
      snowLit: "#c2cff3",
      snowShade: "#4e5d9a",
      gully: "#35427e",
      crest: "#f6f9ff",
      ridge: "#7080bd",
      haze: "#24305f",
      snowAlt: horizon * 0.15,
      hazeRows: 20,
    },
    23,
  );

  /* Delante: lomas de nieve, pinos, el santuario y las huellas. */
  c = front.c;
  const wave = (x: number, phase: number, a: number, b: number) => a * Math.sin(x * 0.031 + phase) + b * Math.sin(x * 0.083 + phase * 3);
  const bankFar = (x: number) => Math.round(horizon + 6 + wave(x, 1.3, 3, 1.5));
  const bankMid = (x: number) => Math.round(height - ground * 0.42 + wave(x, 4.1, 4, 1.5));
  const bankNear = (x: number) => Math.round(height - 10 + wave(x, 2.2, 3, 2));

  snowBank(c, width, height, bankFar, { crest: "#a3b2e4", light: "#6d7cb8", body: "#3f4d88", deep: "#323f76" });
  // Pinitos lejanos sobre la primera loma.
  for (let x = Math.floor(random() * 5); x < width + 4; x += 3 + Math.floor(random() * 9)) {
    if (random() < 0.25) x += 10;
    pine(c, x, bankFar(x) + 3, 7 + Math.floor(random() * 9), PINE_FAR);
  }
  snowBank(c, width, height, bankMid, { crest: "#d6e1ff", light: "#91a0d8", body: "#53619e", deep: "#3d4a86" });

  const shrineX = place.wide ? place.right : Math.round(width * 0.66);
  const shrineBase = bankMid(shrineX) + 2;

  // Pinos medianos a lo largo de la loma del medio, dejando sitio al santuario.
  for (let x = Math.floor(random() * 10); x < width + 8; x += 12 + Math.floor(random() * 22)) {
    if (Math.abs(x - shrineX) < 28) continue;
    // Unos pinos van en grupito, otros solos; y no todos del mismo alto.
    if (random() < 0.3) x += 14;
    const tall = 12 + Math.floor(random() * 22);
    pineShadow(c, x, bankMid(x) + 2, Math.round(tall * 0.9), "#34417f");
    pine(c, x, bankMid(x) + 2, tall, PINE_MID);
  }
  mountainShrine(c, shrineX, shrineBase);
  const lantern = { x: shrineX + 13, y: shrineBase - 16 };

  // Luz del farol sobre la nieve: un charco cálido tramado delante del santuario.
  for (let dy = -2; dy <= 10; dy++) {
    for (let dx = -26; dx <= 26; dx++) {
      const x = lantern.x + 2 + dx;
      const y = shrineBase + dy;
      if (y < bankMid(x) || y >= height) continue;
      const distance = Math.hypot(dx / 2.2, dy);
      if (distance < 12 && dither(x, y, (1 - distance / 12) * 0.65)) rect(c, x, y, 1, 1, distance < 5 ? "#e8c6a4" : "#a98e9e");
    }
  }

  // Huellas que suben desde abajo a la izquierda hasta la puerta del santuario.
  const startX = place.wide ? shrineX - 110 : Math.round(width * 0.12);
  const steps = 26;
  for (let step = 0; step < steps; step++) {
    const f = step / (steps - 1);
    const x = Math.round(startX + (shrineX - startX) * f + Math.sin(f * 5) * 6);
    const y = Math.round(height - 4 - (height - 4 - shrineBase - 1) * Math.pow(f, 0.8));
    const side = step % 2 ? 1 : -1;
    const size = f > 0.6 ? 1 : 2;
    rect(c, x + side, y, size, 2, "#2e3972");
    rect(c, x + side, y + 2, size, 1, "#b9c7f0");
  }

  // Pinos grandes de primer plano: a los dos lados, y uno en el lado del espíritu.
  c = nearby.c;
  const ghostPine = { x: place.wide ? place.left + 20 : Math.round(width * 0.3), base: 0 };
  ghostPine.base = bankMid(ghostPine.x) + 3;
  pineShadow(c, ghostPine.x, ghostPine.base, clamp(Math.round(height * 0.15), 30, 54), "#34417f");
  const ghostTree = pine(c, ghostPine.x, ghostPine.base, clamp(Math.round(height * 0.17), 34, 60), PINE_NEAR);
  snowBank(c, width, height, bankNear, { crest: "#dfe8ff", light: "#8796d0", body: "#46549a", deep: "#2c376e" });
  const edgeTall = clamp(Math.round(height * 0.3), 58, 120);
  const bigPines: [number, number, number][] = [
    [4, height - 2, edgeTall],
    [width - 5, height - 2, Math.round(edgeTall * 0.85)],
  ];
  if (place.wide) bigPines.push([place.left - 34, height - 4, Math.round(edgeTall * 0.6)], [place.right + 40, height - 3, Math.round(edgeTall * 0.55)]);
  for (const [x, base, tall] of bigPines) {
    pineShadow(c, x, base, Math.round(tall * 0.7), "#252f63");
    pine(c, x, base, tall, PINE_NEAR);
  }

  /* Ventisca a ras del suelo: una tira tramada que se repite y corre con el viento. */
  const driftWidth = 80;
  const driftHeight = 14;
  const drift = layer(driftWidth, driftHeight);
  drift.c.fillStyle = "#c6d4f6";
  for (let y = 0; y < driftHeight; y++) {
    const crest = Math.sin(((y + 0.5) / driftHeight) * Math.PI);
    for (let x = 0; x < driftWidth; x++) {
      const gust = 0.5 + 0.5 * Math.sin((x / driftWidth) * Math.PI * 4 + y * 0.5);
      if (dither(x, y, crest * gust * 0.45)) drift.c.fillRect(x, y, 1, 1);
    }
  }
  const drawDrift = (target: Ctx, y: number, shift: number, alpha: number) => {
    target.globalAlpha = alpha;
    for (let x = -wrap(Math.round(shift), driftWidth); x < width; x += driftWidth) target.drawImage(drift.canvas, x, y);
    target.globalAlpha = 1;
  };

  /* La aurora: una cinta verde agua grande y otra violeta más alta y tenue. */
  const auroraTall = clamp(Math.round(horizon * 0.3), 26, 90);
  const ribbons: Ribbon[] = [
    {
      strip: auroraStrip(width, auroraTall, ["#b8ffe8", "#5fe3c0", "#3a98b4", "#6a52c8"], random, 1, 0.85),
      base: (x) => horizon * (0.5 - 0.1 * (x / width)),
      reach: clamp(horizon * 0.05, 4, 14),
      pace: 0.11,
      phase: random() * 6.28,
      drift: 1.2,
    },
    {
      strip: auroraStrip(width, Math.round(auroraTall * 0.8), ["#e2c4ff", "#a07ae8", "#6650c0", "#3e3d98"], random, 0.8, 0.6),
      base: (x) => horizon * (0.28 + 0.1 * (x / width)),
      reach: clamp(horizon * 0.04, 3, 10),
      pace: 0.08,
      phase: random() * 6.28,
      drift: -0.8,
    },
  ];

  // La aurora se mueve tan despacio que basta rehacerla cuatro veces por segundo;
  // entre una y otra se reutiliza ya pintada (así cada cuadro cuesta muy poco).
  const sheen = layer(width, Math.min(height, Math.ceil(horizon * 0.62) + 16));
  let sheenKey = Number.NaN;
  const drawAurora = (target: Ctx, t: number, still: boolean) => {
    const key = still ? -1 : Math.floor(t * 4);
    if (key !== sheenKey) {
      sheenKey = key;
      sheen.c.clearRect(0, 0, width, sheen.canvas.height);
      for (const ribbon of ribbons) drawRibbon(sheen.c, ribbon, width, still ? 0 : key / 4);
    }
    target.drawImage(sheen.canvas, 0, 0);
  };

  /* Copos: lejos pequeños y lentos, cerca grandes y rápidos. */
  const flakes = (count: number, fall: number, spread: number): Flake[] =>
    Array.from({ length: count }, () => ({
      x: random() * (width + 8),
      y: random() * (height + 8),
      fall: fall + random() * spread,
      sway: 0.4 + random() * 0.8,
      reach: 2 + random() * 4,
      phase: random() * 6.28,
    }));
  const farFlakes = flakes(clamp(Math.round(width / 4), 24, 220), 5, 4);
  const midFlakes = flakes(clamp(Math.round(width / 8), 12, 110), 10, 5);
  const nearFlakes = flakes(clamp(Math.round(width / 18), 6, 50), 18, 8);
  const flakeAt = (flake: Flake, t: number, wind: number) => ({
    x: Math.round(wrap(flake.x + t * wind + Math.sin(t * flake.sway + flake.phase) * flake.reach, width + 8)) - 4,
    y: Math.round(wrap(flake.y + t * flake.fall, height + 8)) - 4,
  });

  return {
    world: 4,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      // El viento sopla hacia la izquierda, a ráfagas suaves.
      const wind = -(3 + Math.sin(t * 0.25) * 2);
      target.drawImage(back.canvas, 0, 0);
      if (!still) twinkle(target, stars, time, "#ffffff", "#9fb2ee");
      drawAurora(target, t, still);
      target.drawImage(middle.canvas, 0, 0);

      for (const flake of farFlakes) {
        const { x, y } = flakeAt(flake, t, wind * 0.5);
        rect(target, x, y, 1, 1, "#7d8cc6");
      }

      target.drawImage(front.canvas, 0, 0);

      // El farol: único punto cálido. Su halo crece y se encoge un poquito, como una llama.
      const flicker = still ? 0 : Math.sin(t * 7) + Math.sin(t * 11.3) * 0.6;
      glow(target, lantern.x + 2, lantern.y + 4, 3, flicker > 0.8 ? 11 : 10, "#8a5a52", 0.45);
      glow(target, lantern.x + 2, lantern.y + 4, 3, 6, "#c9814e", flicker > 0.2 ? 0.5 : 0.4);
      paintSprite(target, HANGING_LANTERN, HANGING_COLORS, lantern.x, lantern.y);
      if (flicker > 0.9) rect(target, lantern.x + 2, lantern.y + 3, 1, 1, "#fff4c8");

      // El espíritu tímido: casi siempre escondido detrás del pino; a ratos se asoma hacia el farol, mira y vuelve.
      const cycle = t % 11;
      const ease = (value: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(value, 0, 1));
      const out = still ? 0.8 : cycle < 2 ? ease(cycle / 2) : cycle < 6 ? 1 : cycle < 8 ? 1 - ease((cycle - 6) / 2) : 0;
      if (out > 0) {
        const gx = Math.round(ghostPine.x - 5 + out * (ghostTree.half + 3));
        const gy = Math.round(ghostPine.base - 16 + Math.sin(t * 1.4) * 1.5);
        const closed = !still && cycle > 3.4 && cycle < 3.6;
        target.globalAlpha = 0.92;
        paintSprite(target, closed ? GHOST.blink : GHOST.open, GHOST_COLORS, gx, gy);
        target.globalAlpha = 1;
      }

      target.drawImage(nearby.canvas, 0, 0);

      for (const flake of midFlakes) {
        const { x, y } = flakeAt(flake, t, wind * 0.8);
        rect(target, x, y, 1, 1, "#dbe5ff");
      }

      drawDrift(target, horizon + 2, -t * 5, 0.3);
      drawDrift(target, height - driftHeight + 2, -t * 11, 0.4);

      for (const flake of nearFlakes) {
        const { x, y } = flakeAt(flake, t, wind * 1.2);
        rect(target, x, y, 2, 2, "#ffffff");
        if (flake.phase > 3.14) {
          rect(target, x + 2, y, 1, 1, "#c3d1fa");
          rect(target, x - 1, y + 1, 1, 1, "#c3d1fa");
        }
      }
    },
  };
}
