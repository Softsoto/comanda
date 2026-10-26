/**
 * Mundo 3 · EL LAGO DE LOS FAROLES.
 *
 * Noche azul profunda sobre un lago en calma. Al fondo, montañas en capas que se
 * van aclarando con la distancia; arriba, una luna llena con un halo y una nube
 * fina que la cruza. El agua lo refleja todo y ondula: el cielo, las montañas,
 * el puente rojo en arco y la casita de té sobre pilotes, con sus ventanas de
 * papel encendidas. La luna deja en el agua una columna de franjas que tiemblan.
 *
 * Sobre el agua flotan faroles de papel con su reflejo naranja, y otros suben
 * despacio al cielo, se achican y se apagan a lo lejos. Una barquita con su
 * farol cruza muy despacio, y en la orilla cercana hay juncos y flores de loto.
 *
 * Lo que manda es el contraste: todo es azul frío y las únicas luces cálidas
 * (faroles, ventanas, el puente) son las que tiñen lo que tocan.
 *
 * Cómo se pinta: el cielo, la luna y las montañas van en una capa de fondo; el
 * puente y la casita, en otra capa (la del medio). Con las dos se arma una sola
 * vez el "reflejo" (la imagen de arriba volteada y oscurecida). En cada cuadro
 * ese reflejo se copia fila por fila corriendo cada fila uno o dos píxeles a un
 * lado: así el agua ondula sin tener que volver a pintar nada.
 */

import { clamp, dither, paintSprite, rect, seeded, type Colors, type Ctx, type Sprite } from "./art";
import { disc, glow, layer, line, peaks, places, scatterStars, sky, twinkle, wrap, type Scene, type Star } from "./scenery";

/* ---------- Paleta ---------- */

const LAKE_SKY = ["#030820", "#050d2b", "#081438", "#0c1b47", "#122457", "#1a2f68", "#263b78", "#364785", "#4a5290"];
const LAKE_STOPS = [0, 0.14, 0.28, 0.41, 0.53, 0.65, 0.76, 0.86, 0.94];

/** Agua: el fondo liso, el tono con que se oscurece el reflejo y las ondas con luz de luna. */
const WATER = "#081232";
const WATER_SHADE = "#050b24";
const RIPPLE = ["#1a2b62", "#25397a", "#3a5196"];

/** Lo cálido: faroles y ventanas. Del más claro al más apagado. */
const FIRE = ["#fff1b8", "#ffc46b", "#f0a040", "#d8692c", "#9c3f26"];

/* ---------- Dibujos ---------- */

const FIRE_COLORS: Colors = { w: FIRE[0], y: FIRE[1], o: FIRE[2], r: FIRE[3], k: "#3a1a1c", b: "#5a2a1e" };

/** Faroles que flotan en el agua (cajitas de papel con base de madera), de cerca a lejos. */
const FLOATING: readonly Sprite[] = [
  [".kkkkk.", "koyyyok", "koywyok", "koywyok", "koyyyok", "bbbbbbb"],
  ["kkkkk", "oyyyo", "oywyo", "oyyyo", "bbbbb"],
  ["ooo", "oyo", "bbb"],
  ["yo", "bb"],
];

/** Faroles que suben al cielo: redondeados arriba y con la llamita abierta abajo. */
const RISING: readonly Sprite[] = [
  [".ooo.", "oyyyo", "oywyo", "oywyo", "ryyyr", ".rwr."],
  [".o.", "oyo", "oyo", "rwr"],
  ["oo", "yo"],
  ["o"],
];

/** La barquita: farol colgado de una pértiga atrás, el barquero con sombrero de paja y el remo. */
const BOAT: Sprite = [
  "..qqqqq...................",
  ".q.....l..................",
  ".q....LYL.........H.......",
  ".q....YWY........HHh......",
  ".q....LYL.......HHhhh.....",
  ".q.....l.......HHhhhhh....",
  ".q..............sbb.......",
  ".q.............bbbbBo.....",
  ".q.............bbbB..o....",
  "kq............bbbbB...o..k",
  "EEEEEEEEEEEEEEEEEEEEEEEoEE",
  ".kwwwkkkkkkkkkkkkkkkkkkkk.",
  "..kwkkkkkkkkkkkkkkkkkkkk..",
  "....eeeeeeeeeeeeeeeeeee...",
];
const BOAT_COLORS: Colors = {
  q: "#2a2f5e",
  l: "#2a2f5e",
  L: FIRE[3],
  Y: FIRE[1],
  W: FIRE[0],
  H: "#8a96d8",
  h: "#3d4890",
  s: "#a8805e",
  b: "#1c2458",
  B: "#4a58a8",
  o: "#5a5a8a",
  E: "#6f7fc8",
  k: "#141a44",
  w: "#7a4a3a",
  e: "#0a0f2a",
};
/** El mismo dibujo en el reflejo: todo más oscuro y azulado, menos el farol. */
const BOAT_SHADOW: Colors = {
  q: "#141c48",
  l: "#141c48",
  L: FIRE[4],
  Y: FIRE[3],
  W: FIRE[2],
  H: "#2c3876",
  h: "#18205a",
  s: "#3a3050",
  b: "#121a46",
  B: "#22306a",
  o: "#22306a",
  E: "#2c3a7a",
  k: "#0e1440",
  w: "#3a2a44",
  e: "#0a1032",
};

/** Flor de loto abierta, con la luz cálida de los faroles en el centro. */
const LOTUS: Sprite = ["...l...", ".l.p.l.", ".lpppl.", "lppyppd", ".dpppd."];
const LOTUS_COLORS: Colors = { l: "#ffd3e6", p: "#f08cb6", d: "#b2507e", y: "#ffe08a" };
/** Capullo cerrado. */
const BUD: Sprite = [".l.", "lpd", "lpd", ".d."];

/* ---------- Piezas del paisaje ---------- */

/** Cordillera: relleno, filo de luz del lado de la luna y una bruma tramada en su base. */
function range(c: Ctx, heights: readonly number[], base: number, body: string, edge: string, haze: string, hazeRows: number, moonLeft: boolean) {
  const width = heights.length;
  for (let x = 0; x < width; x++) {
    const h = heights[x];
    rect(c, x, base - h, 1, h, body);
    const neighbour = heights[x + (moonLeft ? -1 : 1)] ?? h;
    // La ladera que mira a la luna recibe un filo de luz; si es empinada, más largo.
    if (h > neighbour) rect(c, x, base - h, 1, clamp(h - neighbour + 1, 1, 3), edge);
  }
  // La bruma al pie hace que cada capa se separe de la de delante.
  c.fillStyle = haze;
  for (let row = 0; row < hazeRows; row++) {
    const y = base - row;
    for (let x = 0; x < width; x++) {
      if (heights[x] > row && dither(x, y, ((hazeRows - row) / hazeRows) * 0.55)) c.fillRect(x, y, 1, 1);
    }
  }
}

/** Orilla lejana con pinos pequeñitos recortados contra la bruma. */
function farShore(c: Ctx, random: () => number, width: number, base: number, color: string, edge: string) {
  const hills = peaks(random, width, 3, 9, 70);
  for (let x = 0; x < width; x++) rect(c, x, base - hills[x], 1, hills[x] + 1, color);
  for (let x = Math.floor(random() * 4); x < width; x += 2 + Math.floor(random() * 5)) {
    const tall = 3 + Math.floor(random() * 6);
    const top = base - hills[clamp(x, 0, width - 1)] - tall + 1;
    for (let row = 0; row < tall; row++) {
      const spread = Math.floor((row * 2) / 3) >> 1;
      rect(c, x - spread, top + row, spread * 2 + 1, 1, color);
    }
    rect(c, x, top, 1, 1, edge);
  }
}

/** Arco del puente: altura del borde de arriba de la viga en cada columna. */
const archTop = (dx: number, half: number, base: number, rise: number) => {
  const f = dx / half;
  return base - 5 - Math.round(rise * (1 - f * f));
};

/** Puente rojo en arco con barandas, remates dorados y dos faroles en los extremos. */
function bridge(c: Ctx, cx: number, base: number, half: number) {
  const red = "#d8452e";
  const redLight = "#ff8a5c";
  const redDark = "#8e2620";
  const post = "#6a1c1a";
  const gold = "#e8c25a";
  const rise = Math.round(half * 0.55);

  // Pilotes que bajan al agua, por pares; los de atrás más oscuros.
  for (const f of [-0.62, -0.28, 0.28, 0.62]) {
    const x = cx + Math.round(f * half);
    const top = archTop(x - cx, half, base, rise) + 3;
    rect(c, x - 1, top, 1, base - top, "#3a1220");
    rect(c, x + 1, top, 2, base - top, post);
    rect(c, x + 1, top, 1, base - top, red);
    rect(c, x - 1, top + Math.round((base - top) * 0.55), 4, 1, post);
  }

  // Viga del puente: canto de luz, cuerpo rojo y sombra abajo.
  for (let dx = -half; dx <= half; dx++) {
    const y = archTop(dx, half, base, rise);
    rect(c, cx + dx, y, 1, 1, redLight);
    rect(c, cx + dx, y + 1, 1, 2, red);
    rect(c, cx + dx, y + 3, 1, 1, redDark);
  }

  // Baranda: postes cada pocos píxeles, pasamanos arriba y un listón al medio.
  for (let dx = -half + 1; dx <= half - 1; dx++) {
    const y = archTop(dx, half, base, rise);
    rect(c, cx + dx, y - 5, 1, 1, red);
    rect(c, cx + dx, y - 6, 1, 1, redLight);
    rect(c, cx + dx, y - 3, 1, 1, redDark);
    if ((dx + half) % 5 === 1) rect(c, cx + dx, y - 5, 1, 5, red);
  }
  // Remates dorados (giboshi) en los extremos y en el centro de cada lado.
  for (const dx of [-half + 1, half - 1]) {
    const y = archTop(dx, half, base, rise);
    rect(c, cx + dx - 1, y - 7, 2, 7, red);
    rect(c, cx + dx - 1, y - 7, 1, 7, redLight);
    rect(c, cx + dx - 1, y - 9, 2, 2, gold);
    rect(c, cx + dx - 1, y - 10, 1, 1, "#fff0b0");
  }

  // Bases de piedra donde apoya el puente.
  for (const side of [-1, 1]) {
    const x = cx + side * half;
    disc(c, x, base, 4, "#101836", (dx, dy) => dy <= 0);
    rect(c, x - 3, base - 4, 4, 1, "#3a4a8a");
    rect(c, x - 4, base - 2, 1, 1, "#3a4a8a");
  }
}

/** Faroles de piedra en los extremos del puente: la luz cálida tiñe la baranda. */
function bridgeLights(c: Ctx, cx: number, base: number, half: number) {
  for (const side of [-1, 1]) {
    const x = cx + side * (half + 3);
    const y = base - 13;
    glow(c, x, y + 3, 2, clamp(Math.round(half / 5), 5, 9), "#7a3a34", 0.45);
    rect(c, x - 2, y, 5, 1, "#1a2148");
    rect(c, x - 1, y + 1, 3, 3, FIRE[1]);
    rect(c, x, y + 2, 1, 1, FIRE[0]);
    rect(c, x - 2, y + 4, 5, 1, "#1a2148");
    rect(c, x, y + 5, 1, base - y - 5, "#141a3c");
  }
}

/** Casita de té sobre pilotes: paredes de madera, ventanas de papel encendidas y tejado curvo. */
function teaHouse(c: Ctx, cx: number, base: number, half: number, pierTo: number) {
  const deck = base - 6;
  const wall = "#1c2350";
  const wallLight = "#2c3670";
  const roof = "#202a5e";
  const roofTile = "#141a42";
  const roofEdge = "#6a7ac4";

  // Muelle hasta el borde de la pantalla, con sus pilotes.
  for (let x = cx - half - 6; x < pierTo; x++) {
    rect(c, x, deck, 1, 1, "#4a3f6a");
    rect(c, x, deck + 1, 1, 1, "#1e1a3a");
  }
  for (let x = cx - half - 5; x < pierTo; x += 6) {
    rect(c, x, deck + 2, 1, base - deck - 1, "#141a3c");
    rect(c, x + 1, deck + 2, 1, base - deck - 1, "#272f60");
  }

  // Resplandor de las ventanas sobre la madera.
  glow(c, cx, deck - 6, 4, half + 9, "#5a3448", 0.45);

  // Paredes.
  const top = deck - 15;
  rect(c, cx - half, top, half * 2, 15, wall);
  rect(c, cx - half, top, 1, 15, wallLight);
  // Ventanas de papel (shoji): paneles encendidos con su cuadrícula de madera.
  const panes = half >= 14 ? 3 : 2;
  const paneWidth = Math.floor((half * 2 - 4 - (panes - 1)) / panes);
  for (let index = 0; index < panes; index++) {
    const px = cx - half + 2 + index * (paneWidth + 1);
    rect(c, px, top + 3, paneWidth, 9, FIRE[1]);
    rect(c, px, top + 3, paneWidth, 1, FIRE[0]);
    rect(c, px, top + 11, paneWidth, 1, FIRE[2]);
    for (let gx = px + 2; gx < px + paneWidth - 1; gx += 3) rect(c, gx, top + 3, 1, 9, "#c9853a");
    rect(c, px, top + 7, paneWidth, 1, "#c9853a");
  }
  // Una silueta sentada tras el papel: alguien toma el té.
  rect(c, cx + 1, top + 7, 3, 5, "#b0602c");
  rect(c, cx + 1, top + 5, 2, 2, "#b0602c");
  // Barandilla de la terraza.
  rect(c, cx - half - 4, deck - 3, half * 2 + 8, 1, "#3d3462");
  for (let x = cx - half - 4; x <= cx + half + 4; x += 4) rect(c, x, deck - 3, 1, 3, "#3d3462");

  // Tejado: filas que se ensanchan hacia el alero, con las puntas levantadas.
  const rows = 8;
  for (let row = 0; row < rows; row++) {
    const w = half * 2 - 8 + row * 2 + (row === rows - 1 ? 4 : 0);
    const y = top - rows + row;
    rect(c, cx - (w >> 1), y, w, 1, row % 2 ? roof : roofTile);
    // La luna está a la izquierda: ese faldón tiene el filo de luz.
    rect(c, cx - (w >> 1), y, 2, 1, roofEdge);
  }
  rect(c, cx - half + 4, top - rows - 1, half * 2 - 8, 1, roofEdge);
  const eave = half + 7;
  rect(c, cx - eave, top - 2, 1, 1, roofEdge);
  rect(c, cx - eave - 1, top - 3, 1, 1, roofEdge);
  rect(c, cx + eave - 1, top - 2, 1, 1, roof);
  rect(c, cx + eave, top - 3, 1, 1, roof);
  rect(c, cx - eave + 1, top - 1, eave * 2 - 2, 1, roofTile);

  // Farolito rojo colgado del alero.
  const lx = cx + eave - 4;
  rect(c, lx + 1, top, 1, 2, "#0a0f28");
  glow(c, lx + 1, top + 4, 2, 6, "#6a3036", 0.5);
  paintSprite(c, ["kkk", "rwr", "ryr", "kkk"], FIRE_COLORS, lx, top + 2);
}

/** Matojo de juncos: hojas finas que se curvan, con espigas oscuras y el canto con luz de luna. */
function reeds(c: Ctx, random: () => number, from: number, to: number, bottom: number, tallest: number) {
  for (let x = from; x < to; x += 1 + Math.floor(random() * 3)) {
    const tall = Math.round(tallest * (0.35 + random() * 0.65));
    const lean = (random() - 0.5) * tall * 0.5;
    const top = bottom - tall;
    line(c, x, bottom, Math.round(x + lean), top, 1, "#050a1e");
    if (random() < 0.5) rect(c, Math.round(x + lean) - 1, top + 1, 1, 2, "#26336e");
    // Algunas tienen espiga (la "salchicha" de la enea).
    if (random() < 0.35) {
      const sx = Math.round(x + lean * 0.9);
      rect(c, sx, top + 2, 2, 5, "#1a1230");
      rect(c, sx, top + 2, 1, 4, "#3a2a4a");
      rect(c, sx, top, 1, 2, "#050a1e");
    }
  }
}

/** Hoja de loto en perspectiva (aplastada), con su muesca y el borde de arriba iluminado. */
function lotusPad(c: Ctx, cx: number, cy: number, radius: number) {
  const ry = Math.max(1, Math.round(radius * 0.38));
  for (let dy = -ry; dy <= ry; dy++) {
    const span = Math.round(radius * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    for (let dx = -span; dx <= span; dx++) {
      // La muesca: una cuña que llega al centro.
      if (dy > 0 && Math.abs(dx - 1) <= dy * 0.6 && dx > -1) continue;
      const color = dy === -ry || (dy < 0 && Math.abs(dx) === span) ? "#2f6a6a" : dy > ry * 0.4 ? "#0a2230" : "#123844";
      rect(c, cx + dx, cy + dy, 1, 1, color);
    }
  }
}

/* ---------- La escena ---------- */

type Floating = { x: number; depth: number; y: number; speed: number; phase: number; size: number };
type Rising = { x: number; from: number; to: number; drift: number; period: number; offset: number; near: boolean };

export function lake(width: number, height: number): Scene {
  const random = seeded(3333);
  const place = places(width);
  const water = clamp(Math.round(height * 0.42), 64, 200);
  const horizon = height - water;
  const moon = {
    x: place.left,
    y: Math.max(32, Math.round(horizon * 0.3)),
    r: clamp(Math.round(Math.min(width, horizon) * 0.11), 9, 24),
  };
  // El puente y la casita apoyan en el agua un poco más acá de la orilla lejana.
  const base = horizon + Math.round(water * 0.2);
  const half = clamp(Math.round(width * 0.1), 22, 58);
  const house = place.wide ? { x: place.right, half: clamp(Math.round(width * 0.03), 14, 22) } : null;
  const bridgeX = house ? house.x - house.half - half - 8 : place.right;

  /* Fondo: cielo, estrellas, luna, montañas y la orilla lejana. */
  const back = layer(width, height);
  let c = back.c;
  sky(c, width, horizon, LAKE_SKY, LAKE_STOPS);

  // Un río de estrellas muy tenue cruzando el cielo en diagonal.
  c.fillStyle = "#13235a";
  for (let y = 0; y < horizon * 0.7; y++) {
    for (let x = 0; x < width; x++) {
      const distance = Math.abs(y - (horizon * 0.62 - x * 0.35 * (horizon / Math.max(width, 1)) * 1.6)) / (horizon * 0.12);
      if (distance < 1 && dither(x, y, (1 - distance) * 0.3)) c.fillRect(x, y, 1, 1);
    }
  }
  const stars = scatterStars(c, random, width, Math.round(horizon * 0.85), 200, ["#5a6cb0", "#7d8fd0", "#a9b8ee"], moon);

  // Luna llena, fría, con halo en dos anillos y una sombra suave.
  glow(c, moon.x, moon.y, moon.r, moon.r + 16, "#1d2c6a", 0.45);
  glow(c, moon.x, moon.y, moon.r, moon.r + 7, "#2e3f86", 0.55);
  disc(c, moon.x, moon.y, moon.r, "#f4f6ff");
  disc(c, moon.x, moon.y, moon.r, "#d4dcf6", (dx, dy) => Math.hypot(dx + moon.r * 0.32, dy + moon.r * 0.22) > moon.r * 1.05);
  disc(c, moon.x + Math.round(moon.r * 0.3), moon.y - Math.round(moon.r * 0.2), Math.max(1, Math.round(moon.r * 0.2)), "#dfe5fa");
  disc(c, moon.x - Math.round(moon.r * 0.35), moon.y + Math.round(moon.r * 0.3), Math.max(1, Math.round(moon.r * 0.15)), "#dfe5fa");
  disc(c, moon.x + Math.round(moon.r * 0.05), moon.y + Math.round(moon.r * 0.55), Math.max(1, Math.round(moon.r * 0.12)), "#c4cdee");
  // Nubes largas y finas que cortan la luna por debajo: el borde de arriba lo pinta la luna.
  const streak = (from: number, y: number, length: number, thickness: number) => {
    for (let x = 0; x < length; x++) {
      const f = x / length;
      // Panza irregular: se engrosa y se adelgaza, y las puntas se afilan.
      const thick = Math.round(Math.pow(Math.sin(f * Math.PI), 0.8) * thickness + Math.sin(x * 0.45) * 0.7);
      if (thick < 1) continue;
      const top = y - (thick >> 1);
      const lit = Math.abs(from + x - moon.x) < moon.r * 1.6;
      rect(c, from + x, top, 1, 1, lit ? "#7d8cd0" : "#3f4e96");
      rect(c, from + x, top + 1, 1, thick, "#1e2a64");
      if (thick > 1) rect(c, from + x, top + thick, 1, 1, "#141d4e");
    }
  };
  streak(moon.x - moon.r * 3, moon.y + Math.round(moon.r * 0.4), moon.r * 5, 3);
  streak(moon.x - Math.round(moon.r * 0.6), moon.y + Math.round(moon.r * 0.4) + 5, moon.r * 3, 2);
  streak(moon.x + moon.r * 3, moon.y - Math.round(moon.r * 0.8), moon.r * 2, 1);

  // Montañas en tres capas: las lejanas más claras y violetas, las cercanas más oscuras.
  const tall = clamp(Math.round(horizon * 0.34), 26, 90);
  range(c, peaks(random, width, tall * 0.45, tall, 54), horizon, "#2b3478", "#4f5aa8", "#3d4790", 8, true);
  range(c, peaks(random, width, tall * 0.25, tall * 0.68, 38), horizon, "#1c2560", "#34408a", "#2b3478", 6, true);
  range(c, peaks(random, width, tall * 0.1, tall * 0.36, 26), horizon, "#121a48", "#25306e", "#1c2560", 4, true);
  farShore(c, random, width, horizon, "#0b1236", "#1e2a62");
  rect(c, 0, horizon, width, water, WATER);

  /* El medio: el puente y la casita de té, que también se reflejan. */
  const middle = layer(width, height);
  c = middle.c;
  if (house) teaHouse(c, house.x, base, house.half, width);
  else {
    // En el celular no cabe la casita: el puente desemboca en un muelle.
    for (let x = bridgeX + half + 3; x < width; x++) rect(c, x, base - 6, 1, 1, "#4a3f6a");
    for (let x = bridgeX + half + 6; x < width; x += 6) rect(c, x, base - 5, 1, 5, "#141a3c");
  }
  bridgeLights(c, bridgeX, base, half);
  bridge(c, bridgeX, base, half);

  /* El reflejo: lo de arriba volteado, con un borde extra a cada lado para cuando ondula. */
  const pad = 4;
  const mirror = layer(width + pad * 2, water);
  const m = mirror.c;
  for (let row = 0; row < water; row++) {
    const source = horizon - 1 - row;
    if (source < 0) break;
    for (const shift of [0, pad * 2, pad]) m.drawImage(back.canvas, 0, source, width, 1, shift, row, width, 1);
  }
  for (let row = 0; base + row < height; row++) {
    const source = base - 1 - row;
    if (source < 0) break;
    m.drawImage(middle.canvas, 0, source, width, 1, pad, base - horizon + row, width, 1);
  }
  // Oscurecer: más cerca de la orilla de acá, el agua refleja menos (y se ve más oscura).
  for (let row = 0; row < water; row++) {
    const f = row / water;
    m.globalAlpha = 0.38 + f * 0.32;
    rect(m, 0, row, width + pad * 2, 1, WATER_SHADE);
    m.globalAlpha = 1;
    m.fillStyle = WATER;
    for (let x = 0; x < width + pad * 2; x++) if (dither(x, row, f * 0.35)) m.fillRect(x, row, 1, 1);
  }

  // Cuánto se corre cada fila del reflejo: casi nada lejos, más cerca de nosotros.
  const shiftOf = (row: number, t: number) => {
    const f = row / water;
    const amp = 0.3 + f * 2.1;
    return Math.round(Math.sin(t * 1.3 + row * 0.62 + Math.sin(row * 0.13) * 2) * amp);
  };

  // Estrellas reflejadas: las que caen sobre el agua titilan también, más tenues.
  const echoes: Star[] = stars
    .map((star) => ({ ...star, y: horizon * 2 - 1 - star.y, phase: (star.phase + 4) % 9, big: false }))
    .filter((star) => star.y > base + 2 && star.y < height - 4);

  /* Delante: lotos y juncos de la orilla cercana. */
  const front = layer(width, height);
  c = front.c;
  // La orilla de acá se oscurece un poco hacia abajo.
  c.fillStyle = WATER_SHADE;
  for (let y = height - 14; y < height; y++) {
    for (let x = 0; x < width; x++) if (dither(x, y, ((y - height + 14) / 14) * 0.6)) c.fillRect(x, y, 1, 1);
  }
  const padsFrom = horizon + Math.round(water * 0.7);
  const lotusCount = clamp(Math.round(width / 22), 4, 30);
  for (let index = 0; index < lotusCount; index++) {
    const x = Math.round(random() * width);
    // En pantallas anchas no se ponen bajo el tablero, que no se verían.
    if (place.wide && Math.abs(x - width / 2) < 40) continue;
    const y = padsFrom + Math.round(random() * (height - padsFrom - 6));
    const radius = 3 + Math.round(((y - padsFrom) / (height - padsFrom)) * 5 + random() * 2);
    lotusPad(c, x, y, radius);
    const flower = random();
    if (flower < 0.35) {
      glow(c, x, y - 2, 2, 6, "#4a2a52", 0.45);
      paintSprite(c, LOTUS, LOTUS_COLORS, x - 3, y - 5);
    } else if (flower < 0.55) paintSprite(c, BUD, LOTUS_COLORS, x - 1, y - 5);
  }
  const reedHeight = clamp(Math.round(height * 0.2), 30, 80);
  reeds(c, random, -2, Math.round(width * 0.14), height, reedHeight);
  reeds(c, random, Math.round(width * 0.88), width + 2, height, reedHeight * 0.85);

  /* Lo que se mueve. */
  const floating: Floating[] = Array.from({ length: clamp(Math.round(width / 26), 5, 28) }, () => {
    const depth = 0.06 + random() * 0.84;
    return {
      x: random() * (width + 20),
      depth,
      y: horizon + Math.round(depth * (water - 10)) + 3,
      speed: (0.4 + random() * 0.9) * (0.4 + depth) * (random() < 0.3 ? -1 : 1),
      phase: random() * 6.28,
      size: depth > 0.62 ? 0 : depth > 0.36 ? 1 : depth > 0.18 ? 2 : 3,
    };
  });
  floating.sort((a, b) => a.y - b.y);
  const rising: Rising[] = Array.from({ length: clamp(Math.round(width / 24), 6, 30) }, (_, index) => ({
    x: random() * width,
    from: horizon + Math.round(random() * water * 0.25),
    to: 6 + Math.round(random() * horizon * 0.35),
    drift: 0.6 + random() * 1.2,
    period: 40 + random() * 30,
    offset: index / 4 + random(),
    near: random() < 0.4,
  }));
  const ripples = Array.from({ length: Math.round((width * water) / 160) }, () => {
    const row = Math.floor(random() * random() * water);
    return {
      x: random() * width,
      row,
      length: 2 + Math.round(random() * (3 + (row / water) * 9)),
      speed: (0.6 + random() * 1.4) * (random() < 0.5 ? -1 : 1),
      tone: random() < 0.15 ? 2 : random() < 0.5 ? 1 : 0,
      phase: random() * 6.28,
    };
  });
  const glints = Array.from({ length: Math.round(width / 6) }, () => ({ x: Math.floor(random() * width), length: 1 + Math.floor(random() * 4), phase: random() * 6.28 }));
  const boatY = horizon + Math.round(water * 0.42);
  const boatLap = (width + 60) / 1.8;

  /** Un farol del agua: su resplandor, su reflejo partido en franjas y el farol encima. */
  const drawFloating = (target: Ctx, lantern: Floating, t: number, still: boolean) => {
    const sprite = FLOATING[lantern.size];
    const w = sprite[0].length;
    const x = Math.round(wrap(lantern.x + t * lantern.speed, width + 20)) - 10;
    const bob = still ? 0 : Math.round(Math.sin(t * 1.4 + lantern.phase) * 0.6);
    const y = lantern.y + bob;
    const bottom = y + sprite.length;
    const near = 3 - lantern.size;
    glow(target, x + (w >> 1), bottom - 1, 1, 3 + near * 2, "#5a3040", 0.35 + near * 0.06);
    // El reflejo: franjas naranjas que se acortan y tiemblan hacia abajo.
    // Cada franja aparece y se va a su ritmo, así el reflejo se ve partido y no como una escalera.
    const stripes = 1 + near * 2;
    for (let k = 0; k < stripes; k++) {
      const sy = bottom + 1 + k * 2 + (k > 1 ? 1 : 0);
      const flicker = Math.sin(t * 2.2 + k * 2.3 + lantern.phase);
      if (k > 0 && flicker < -0.35 + (still ? -1 : 0)) continue;
      const wobble = still ? 0 : Math.round(Math.sin(t * 1.7 + k * 1.9 + lantern.phase) * (0.4 + k * 0.35));
      const sw = Math.max(1, w - 2 - k + (flicker > 0.6 ? 1 : 0));
      rect(target, x + Math.round((w - sw) / 2) + wobble, sy, sw, 1, k === 0 ? FIRE[2] : k < 3 ? FIRE[3] : FIRE[4]);
    }
    paintSprite(target, sprite, FIRE_COLORS, x, y);
  };

  return {
    world: 3,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      target.drawImage(back.canvas, 0, 0);
      if (!still) twinkle(target, stars, time, "#f2f6ff", "#8ea0e0");

      // El agua: el reflejo, fila por fila, cada una corrida según la onda.
      for (let row = 0; row < water; row++) {
        target.drawImage(mirror.canvas, pad - shiftOf(row, t), row, width, 1, 0, horizon + row, width, 1);
      }
      if (!still) twinkle(target, echoes, time + 900, "#6f84c8", "#34488a");

      // La orilla lejana brilla a ratos donde toca el agua.
      for (const glint of glints) {
        if (!still && Math.sin(t * 0.9 + glint.phase) < -0.2) continue;
        rect(target, glint.x, horizon, glint.length, 1, "#33458a");
      }

      // Ondas con luz de luna que se deslizan despacio.
      for (const ripple of ripples) {
        if (!still && Math.sin(t * 0.7 + ripple.phase) < -0.4) continue;
        const x = Math.round(wrap(ripple.x + t * ripple.speed, width + 20)) - 10;
        rect(target, x, horizon + 1 + ripple.row, ripple.length, 1, RIPPLE[ripple.tone]);
      }

      // La columna de la luna en el agua: franjas que crecen hacia acá y se parten.
      for (let row = 1; row < water; row++) {
        const f = row / water;
        // Lejos las franjas van pegadas; cerca se separan (cada 2 o 3 filas).
        if (row % (f < 0.25 ? 1 : f < 0.6 ? 2 : 3) !== 0) continue;
        const noise = Math.sin(row * 1.7 + t * 1.9) * 0.6 + Math.sin(row * 0.43 - t * 0.8) * 0.4;
        if (noise < -0.45 && f > 0.08) continue;
        const reach = moon.r * (0.3 + f * 1.5);
        const sw = Math.max(1, Math.round(reach * (0.45 + noise * 0.45)));
        // La franja no siempre está centrada: se mece a un lado y otro.
        const lean = Math.round(Math.sin(row * 0.9 + t * 0.7) * reach * 0.25);
        const x = moon.x - (sw >> 1) + lean - shiftOf(row, t);
        const y = horizon + row;
        rect(target, x, y, sw, 1, f < 0.2 ? "#7f93d6" : "#a9bcf2");
        if (sw > 3) rect(target, x + 1, y, sw - 2, 1, "#dbe5ff");
        if (noise > 0.55) rect(target, x + (sw >> 1), y, 2, 1, "#ffffff");
        // Chispas sueltas a los lados de la columna.
        const spark = Math.sin(row * 3.1 + t * 2.7);
        if (spark > 0.7 && f > 0.15) rect(target, moon.x + Math.round(Math.sin(row * 5.3) * reach * 0.9), y, 1, 1, "#8ea3e6");
      }

      // Faroles del agua que están más lejos que el puente: van detrás de él.
      for (const lantern of floating) if (lantern.y < base - 2) drawFloating(target, lantern, t, still);
      target.drawImage(middle.canvas, 0, 0);

      // Las ventanas de la casita parpadean como velas, apenas.
      if (house && !still && Math.sin(t * 3.1) + Math.sin(t * 5.3) > 1.5) {
        rect(target, house.x - 4, base - 6 - 15 + 4, 2, 1, FIRE[0]);
      }

      // La barquita cruza muy despacio, con su reflejo debajo.
      const boatX = still ? Math.round(width * 0.3) : Math.round(wrap(t * 1.8 + width * 0.45, boatLap)) - 30;
      if (boatX < width + 4) {
        const reflection = [...BOAT].reverse();
        const sway = still ? 0 : shiftOf(boatY - horizon + 6, t);
        paintSprite(target, reflection.slice(0, 9), BOAT_SHADOW, boatX + sway, boatY + BOAT.length);
        glow(target, boatX + 7, boatY + 3, 2, 7, "#5a3040", 0.4);
        paintSprite(target, BOAT, BOAT_COLORS, boatX, boatY + (still ? 0 : Math.round(Math.sin(t * 1.1) * 0.6)));
        for (let k = 0; k < 4; k++) {
          const wobble = still ? 0 : Math.round(Math.sin(t * 2.4 + k * 1.9) * (0.5 + k * 0.3));
          rect(target, boatX + 6 + wobble, boatY + BOAT.length + 9 + k * 2, k < 2 ? 3 : 2, 1, k === 0 ? FIRE[2] : FIRE[3]);
        }
      }

      for (const lantern of floating) if (lantern.y >= base - 2) drawFloating(target, lantern, t, still);

      // Faroles que suben al cielo: se achican, se enfrían y se apagan.
      for (const lantern of rising) {
        const p = still ? wrap(lantern.offset * 0.31, 1) : wrap(t / lantern.period + lantern.offset, 1);
        if (p > 0.96) continue;
        // Al principio sube más rápido; a lo lejos parece ir más despacio.
        const ease = 1 - Math.pow(1 - p, 1.6);
        const y = Math.round(lantern.from - (lantern.from - lantern.to) * clamp(ease, 0, 1));
        const x = Math.round(wrap(lantern.x + p * lantern.period * lantern.drift + Math.sin(t * 0.5 + lantern.offset) * 3, width + 10)) - 5;
        const stage = clamp(Math.floor(p * 2.8) + (lantern.near ? 0 : 1), 0, 3);
        const sprite = RISING[stage];
        if (stage < 2) glow(target, x + (sprite[0].length >> 1), y + 2, 2, stage === 0 ? 8 : 5, "#5a3656", 0.5);
        const colors: Colors = p > 0.8 ? { o: FIRE[4], y: FIRE[3], w: FIRE[2], r: FIRE[4] } : p > 0.6 ? { o: FIRE[3], y: FIRE[2], w: FIRE[1], r: FIRE[4] } : FIRE_COLORS;
        paintSprite(target, sprite, colors, x, y);
      }

      target.drawImage(front.canvas, 0, 0);
    },
  };
}
