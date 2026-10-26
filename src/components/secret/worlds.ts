/**
 * Los paisajes del juego escondido, hechos píxel por píxel. Aquí están los dos
 * primeros; los demás, en worlds-bosque.ts, worlds-lago.ts y worlds-cumbre.ts.
 *
 *   0 · La aldea: de noche, con luna llena, tejados, una pagoda, faroles, un
 *       cerezo y un ninja que corre por los tejados.
 *   1 · El santuario: un portal rojo entre cedros, faroles de piedra, niebla,
 *       fuegos azules y espíritus que flotan.
 *
 * Cada paisaje se arma a la medida del lienzo. Lo que no se mueve se pinta una
 * sola vez en dos capas (el fondo y lo de delante) y se guarda; lo que se mueve
 * se pinta en cada cuadro, entre las dos capas o encima.
 */

import {
  GHOST,
  GHOST_COLORS,
  NINJA,
  NINJA_COLORS,
  WISP,
  WISP_COLORS,
  clamp,
  dither,
  makeCanvas,
  paintSprite,
  rect,
  seeded,
  type Colors,
  type Ctx,
  type Sprite,
} from "./art";
import { WORLD_COUNT } from "../../lib/world-list";
import { bamboo } from "./worlds-bosque";
import { motel } from "./worlds-motel";
import { summit } from "./worlds-cumbre";
import { lake } from "./worlds-lago";
import { disc, glow, layer, line, peaks, places, scatterStars, sky, twinkle, wrap, type Layer, type Scene, type Star } from "./scenery";

export type { Scene } from "./scenery";

export { WORLD_COUNT, WORLD_NAMES, worldName } from "../../lib/world-list";

/** Arma el paisaje número `world` (ya traducido: 0 la aldea… 5 el cuarto del jacuzzi). */
export function createScene(world: number, width: number, height: number): Scene {
  const builders = [village, shrine, bamboo, lake, summit, motel];
  return builders[((world % WORLD_COUNT) + WORLD_COUNT) % WORLD_COUNT](width, height);
}

/* ---------- Mundo 0 · La aldea ---------- */

const VILLAGE_SKY = ["#0b0a24", "#121136", "#1b164c", "#291b60", "#3f206c", "#5f2a76", "#8a3679", "#b84c72"];
const VILLAGE_STOPS = [0, 0.2, 0.38, 0.54, 0.67, 0.78, 0.88, 0.95];

export const LANTERN: Sprite = [".kkk.", "rrorr", "royor", "royor", "royor", "rrorr", ".kkk."];
const LANTERN_COLORS: Colors = { k: "#1a0f14", r: "#ee4f2c", o: "#ffa23f", y: "#ffe58c" };

type Light = { x: number; y: number; width: number; height: number };

type HouseLook = {
  wall: string;
  roof: string;
  /** Canto del tejado que mira a la luna. */
  edge: string;
  /** Ventana apagada. */
  dim: string;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  window: number;
};

const WARM = ["#ffd27a", "#ffbd62", "#ff9d4c"];

/** Una hilera de casas con tejado de alero levantado y ventanas, unas encendidas y otras no. */
function houseRow(c: Ctx, random: () => number, width: number, base: number, bottom: number, look: HouseLook, lights: Light[]) {
  rect(c, 0, base, width, bottom - base, look.wall);
  let x = -Math.floor(random() * look.minWidth);
  while (x < width) {
    const w = look.minWidth + Math.floor(random() * (look.maxWidth - look.minWidth + 1));
    const h = look.minHeight + Math.floor(random() * (look.maxHeight - look.minHeight + 1));
    const top = base - h;
    rect(c, x, top, w, h, look.wall);

    // Tejado: filas que se ensanchan hacia el alero, con las puntas hacia arriba.
    const roofRows = w > 16 ? 4 : 3;
    for (let row = 0; row < roofRows; row++) {
      const rowWidth = w + 4 - (roofRows - 1 - row) * 4;
      const left = x + Math.floor((w - rowWidth) / 2);
      const y = top - roofRows + row;
      rect(c, left, y, rowWidth, 1, look.roof);
      rect(c, left + rowWidth - 1, y, 1, 1, look.edge);
      if (row === 0) rect(c, left + (rowWidth >> 1), y, rowWidth - (rowWidth >> 1), 1, look.edge);
    }
    rect(c, x - 3, top - 2, 1, 1, look.roof);
    rect(c, x + w + 2, top - 2, 1, 1, look.edge);

    // Ventanas.
    const size = look.window;
    const tall = size > 1 ? size + 1 : 1;
    for (let wy = top + 2; wy + tall <= base - 2; wy += tall + 3) {
      for (let wx = x + 2; wx + size <= x + w - 2; wx += size + 2) {
        const chance = random();
        if (chance < 0.46) {
          rect(c, wx, wy, size, tall, WARM[Math.floor(random() * WARM.length)]);
          if (size > 1) lights.push({ x: wx, y: wy, width: size, height: tall });
        } else if (chance < 0.72) rect(c, wx, wy, size, tall, look.dim);
      }
    }
    x += w + 3 + Math.floor(random() * 6);
  }
}

/** La pagoda: pisos cada vez más angostos, cada uno con su tejado, y una aguja arriba. */
function pagoda(c: Ctx, cx: number, base: number) {
  const wall = "#150e32";
  const wallEdge = "#30245f";
  const roof = "#261a55";
  const roofDark = "#0d0820";
  const roofEdge = "#7460c4";
  let y = base;
  for (let floor = 0; floor < 4; floor++) {
    const bodyWidth = 24 - floor * 4;
    const bodyHeight = floor === 0 ? 12 : 9;
    const left = cx - bodyWidth / 2;
    y -= bodyHeight;
    rect(c, left, y, bodyWidth, bodyHeight, wall);
    rect(c, left + bodyWidth - 1, y, 1, bodyHeight, wallEdge);

    const windows = floor < 2 ? 3 : floor === 2 ? 2 : 1;
    const windowHeight = floor === 0 ? 5 : 4;
    for (let index = 0; index < windows; index++) {
      const wx = Math.round(left + (bodyWidth * (index + 1)) / (windows + 1)) - 2;
      rect(c, wx, y + 3, 3, windowHeight, "#ffd27a");
      rect(c, wx + 1, y + 3, 1, windowHeight, "#ffa24a");
      rect(c, wx, y + 3 + (windowHeight >> 1), 3, 1, "#c96a2e");
    }
    rect(c, left - 2, y + bodyHeight - 1, bodyWidth + 4, 1, wallEdge);

    const roofWidth = bodyWidth + 14;
    const roofLeft = cx - roofWidth / 2;
    y -= 4;
    rect(c, roofLeft + 5, y, roofWidth - 10, 1, roof);
    rect(c, roofLeft + 3, y + 1, roofWidth - 6, 1, roof);
    rect(c, roofLeft + 1, y + 2, roofWidth - 2, 1, roof);
    rect(c, roofLeft, y + 3, roofWidth, 1, roofDark);
    // La luna está a la derecha: ese lado del tejado brilla.
    rect(c, cx + 1, y, roofWidth / 2 - 6, 1, roofEdge);
    rect(c, roofLeft + roofWidth - 4, y + 1, 1, 1, roofEdge);
    rect(c, roofLeft + roofWidth - 2, y + 2, 1, 1, roofEdge);
    // Puntas del alero hacia arriba.
    rect(c, roofLeft - 1, y + 2, 1, 1, roof);
    rect(c, roofLeft - 2, y + 1, 1, 1, roof);
    rect(c, roofLeft + roofWidth, y + 2, 1, 1, roofEdge);
    rect(c, roofLeft + roofWidth + 1, y + 1, 1, 1, roofEdge);
  }
  // Aguja con anillos.
  rect(c, cx - 1, y - 12, 2, 12, roofDark);
  rect(c, cx, y - 12, 1, 12, wallEdge);
  for (let ring = 0; ring < 3; ring++) rect(c, cx - 2, y - 4 - ring * 3, 4, 1, roofEdge);
  rect(c, cx - 1, y - 14, 2, 2, "#ffd27a");
}

/** El tejado de primer plano, por donde corre el ninja. */
function frontRoof(c: Ctx, width: number, ridge: number, height: number) {
  rect(c, 0, ridge, width, height - ridge, "#120d2c");
  for (let y = ridge + 3, row = 0; y < height; y += 5, row++) {
    rect(c, 0, y, width, 1, "#1e1849");
    for (let x = row % 2 ? -4 : 0; x < width; x += 8) rect(c, x, y + 1, 1, 4, "#090617");
  }
  rect(c, 0, ridge, width, 3, "#090617");
  rect(c, 0, ridge, width, 1, "#40358c");
  for (let x = 7; x < width; x += 22) {
    rect(c, x, ridge - 2, 4, 2, "#090617");
    rect(c, x + 1, ridge - 2, 2, 1, "#40358c");
  }
}

/** El cerezo: tronco, ramas y copos de flores con luz arriba a la derecha. */
function cherryTree(c: Ctx, random: () => number, ax: number, ay: number) {
  const bark = "#1d0f26";
  const barkLight = "#4a2a52";
  const branches: [number, number, number, number, number][] = [
    [0, 4, -3, -14, 4],
    [-3, -14, -8, -28, 3],
    [-8, -28, -10, -41, 2],
    [-3, -14, -18, -25, 2],
    [-8, -28, -23, -41, 2],
    [-8, -28, 3, -40, 2],
    [-10, -41, -14, -53, 1],
    [-18, -25, -30, -32, 1],
  ];
  for (const [x0, y0, x1, y1, thickness] of branches) line(c, ax + x0, ay + y0, ax + x1, ay + y1, thickness, bark);
  line(c, ax + 1, ay + 4, ax - 2, ay - 14, 1, barkLight);
  line(c, ax - 2, ay - 14, ax - 7, ay - 28, 1, barkLight);

  const blossoms: [number, number, number][] = [
    [-20, -29, 7],
    [-25, -45, 8],
    [-13, -55, 8],
    [1, -47, 8],
    [-6, -39, 6],
    [8, -35, 6],
    [-33, -35, 5],
    [-36, -50, 4],
    [10, -52, 5],
  ];
  for (const [bx, by, radius] of blossoms) {
    const limit = radius * radius + radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const edge = dx * dx + dy * dy;
        // Borde irregular y algún hueco, para que parezca un ramo y no una bola.
        if (edge > limit - random() * radius * 2.2 || random() < 0.05) continue;
        const towardMoon = dx - dy;
        const chance = random();
        const color =
          towardMoon > radius * 0.7 || chance < 0.12 ? "#ffd3e6" : towardMoon < -radius * 0.6 || chance > 0.88 ? "#c9578f" : "#ff9ecb";
        rect(c, ax + bx + dx, ay + by + dy, 1, 1, color);
      }
    }
  }
}

type Petal = { x: number; y: number; fall: number; drift: number; sway: number; phase: number; shape: number; color: string };
type Cloud = { x: number; y: number; speed: number; rows: readonly (readonly [number, number])[] };

const CLOUD_SHAPES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [6, 10],
    [2, 20],
    [0, 26],
    [5, 16],
  ],
  [
    [4, 8],
    [0, 16],
    [3, 10],
  ],
  [
    [9, 12],
    [3, 24],
    [0, 32],
    [6, 22],
    [13, 8],
  ],
];

function village(width: number, height: number): Scene {
  const random = seeded(2026);
  const back = layer(width, height);
  const front = layer(width, height);

  const ground = clamp(Math.round(height * 0.3), 60, 96);
  const horizon = height - ground;
  const ridge = height - 20;
  const place = places(width);
  const moon = {
    x: place.right,
    y: Math.round(horizon * 0.26),
    r: clamp(Math.round(Math.min(width, horizon) * 0.12), 10, 22),
  };

  /* Fondo: cielo, estrellas, luna y montañas. */
  let c = back.c;
  sky(c, width, horizon + 4, VILLAGE_SKY, VILLAGE_STOPS);
  rect(c, 0, horizon + 4, width, height - horizon - 4, VILLAGE_SKY[VILLAGE_SKY.length - 1]);
  const stars = scatterStars(c, random, width, Math.round(horizon * 0.8), 230, ["#8d86d6", "#6a63b8", "#b9b3f2"], moon);

  glow(c, moon.x, moon.y, moon.r, moon.r + 10, "#3a3186", 0.55);
  disc(c, moon.x, moon.y, moon.r, "#fff3cf");
  // Sombra suave abajo a la izquierda y tres cráteres.
  const shade = moon.r * 1.04;
  disc(c, moon.x, moon.y, moon.r, "#ecd9a5", (dx, dy) => Math.hypot(dx - moon.r * 0.3, dy + moon.r * 0.26) > shade);
  disc(c, moon.x - Math.round(moon.r * 0.36), moon.y - Math.round(moon.r * 0.18), Math.max(1, Math.round(moon.r * 0.17)), "#e0cc94");
  disc(c, moon.x + Math.round(moon.r * 0.26), moon.y + Math.round(moon.r * 0.34), Math.max(1, Math.round(moon.r * 0.21)), "#e0cc94");
  disc(c, moon.x + Math.round(moon.r * 0.16), moon.y - Math.round(moon.r * 0.5), Math.max(1, Math.round(moon.r * 0.1)), "#e0cc94");

  const far = peaks(random, width, 12, 34, 42);
  const near = peaks(random, width, 6, 20, 30);
  for (let x = 0; x < width; x++) {
    rect(c, x, horizon + 4 - far[x], 1, far[x], "#2d1d62");
    // El lado que mira a la luna (bajando hacia la derecha) recibe un filo de luz.
    if (far[x] > (far[x + 1] ?? far[x])) rect(c, x, horizon + 4 - far[x], 1, 2, "#4d3c98");
  }
  for (let x = 0; x < width; x++) rect(c, x, horizon + 6 - near[x], 1, near[x], "#22154e");
  rect(c, 0, horizon + 6, width, height - horizon - 6, "#22154e");

  /* Delante: la aldea, la pagoda, el tejado, los faroles y el cerezo. */
  c = front.c;
  const lights: Light[] = [];
  houseRow(
    c,
    random,
    width,
    horizon + 12,
    height,
    {
      wall: "#241852",
      roof: "#2f2166",
      edge: "#5a48a8",
      dim: "#3a2c74",
      minWidth: 8,
      maxWidth: 14,
      minHeight: 5,
      maxHeight: 9,
      window: 1,
    },
    lights,
  );
  houseRow(
    c,
    random,
    width,
    horizon + 28,
    height,
    {
      wall: "#1b1242",
      roof: "#281b5a",
      edge: "#5846a6",
      dim: "#31246a",
      minWidth: 12,
      maxWidth: 20,
      minHeight: 8,
      maxHeight: 14,
      window: 2,
    },
    lights,
  );
  pagoda(c, place.left, horizon + 34);
  houseRow(
    c,
    random,
    width,
    horizon + 48,
    height,
    {
      wall: "#140d33",
      roof: "#20164c",
      edge: "#4f3f9c",
      dim: "#2a1f60",
      minWidth: 16,
      maxWidth: 28,
      minHeight: 12,
      maxHeight: 20,
      window: 2,
    },
    lights,
  );
  frontRoof(c, width, ridge, height);

  // Postes con cuerdas de faroles.
  const lanterns: { x: number; y: number; phase: number }[] = [];
  const from = Math.round(width * 0.3);
  const span = Math.round(width * 0.46);
  const segments = Math.max(1, Math.round(span / 92));
  const segment = span / segments;
  const top = ridge - 30;
  for (let index = 0; index <= segments; index++) {
    const px = Math.round(from + index * segment);
    rect(c, px, top - 2, 2, ridge - top + 2, "#090617");
    rect(c, px + 1, top - 2, 1, ridge - top + 2, "#352b78");
    rect(c, px - 1, top - 3, 4, 1, "#090617");
  }
  for (let index = 0; index < segments; index++) {
    const start = Math.round(from + index * segment);
    const count = Math.max(1, Math.floor(segment / 15));
    for (let x = 2; x < segment; x++) {
      const bend = (x - segment / 2) / (segment / 2);
      rect(c, start + x, top + Math.round(5 * (1 - bend * bend)), 1, 1, "#4a3d96");
    }
    for (let k = 1; k <= count; k++) {
      const x = Math.round((segment * k) / (count + 1));
      const bend = (x - segment / 2) / (segment / 2);
      const y = top + Math.round(5 * (1 - bend * bend));
      rect(c, start + x, y + 1, 1, 2, "#4a3d96");
      lanterns.push({ x: start + x - 2, y: y + 3, phase: Math.floor(random() * 8) });
    }
  }

  cherryTree(c, random, width - 9, ridge);

  /* Lo que se mueve. */
  const blinkers = lights
    .filter(() => random() < 0.12)
    .slice(0, 14)
    .map((light) => ({ ...light, phase: random() * 11 }));
  const petals: Petal[] = Array.from({ length: clamp(Math.round(width / 8), 12, 70) }, () => ({
    x: random() * (width + 8),
    y: random() * (height + 8),
    fall: 5 + random() * 9,
    drift: 3 + random() * 7,
    sway: 0.8 + random() * 1.6,
    phase: random() * 6.28,
    shape: Math.floor(random() * 3),
    color: ["#ff9ecb", "#ffd3e6", "#f47fb4"][Math.floor(random() * 3)],
  }));
  const clouds: Cloud[] = Array.from({ length: clamp(Math.round(width / 90), 2, 6) }, (_, index) => ({
    x: random() * (width + 80),
    y: Math.round(horizon * (0.08 + random() * 0.4)),
    speed: 1.2 + random() * 2.2,
    rows: CLOUD_SHAPES[index % CLOUD_SHAPES.length],
  }));
  const crossing = (width + 60) / 30;

  return {
    world: 0,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      target.drawImage(back.canvas, 0, 0);
      if (!still) twinkle(target, stars, time, "#ffffff", "#aaa4ee");

      // Estrella fugaz, de vez en cuando.
      const shot = t % 13;
      if (!still && shot < 0.5) {
        const turn = Math.floor(t / 13);
        const sx = Math.round(wrap(turn * 97 + 40, width * 0.8) + width * 0.1 - shot * 46);
        const sy = Math.round(wrap(turn * 31 + 8, horizon * 0.3) + 4 + shot * 22);
        ["#ffffff", "#d8d3ff", "#9c95e0", "#6a63b8"].forEach((color, index) => rect(target, sx + index * 2, sy - index, 2, 1, color));
      }

      for (const cloud of clouds) {
        const x = Math.round(wrap(cloud.x + t * cloud.speed, width + 80)) - 40;
        cloud.rows.forEach(([offset, length], row) =>
          rect(target, x + offset, cloud.y + row, length, 1, row === 0 ? "#473c94" : "#2c2569"),
        );
      }

      target.drawImage(front.canvas, 0, 0);

      for (const blinker of blinkers) {
        if (!still && (t + blinker.phase) % 11 < 1.4) rect(target, blinker.x, blinker.y, blinker.width, blinker.height, "#3a2c74");
      }

      const beat = Math.floor(t * 4);
      for (const lantern of lanterns) {
        const big = !still && (beat + lantern.phase) % 4 === 0;
        glow(target, lantern.x + 2, lantern.y + 3, 3, big ? 7 : 6, "#7c2b4d", big ? 0.5 : 0.4);
        paintSprite(target, LANTERN, LANTERN_COLORS, lantern.x, lantern.y);
      }

      for (const petal of petals) {
        const x = Math.round(wrap(petal.x - t * petal.drift + Math.sin(t * petal.sway + petal.phase) * 5, width + 8)) - 4;
        const y = Math.round(wrap(petal.y + t * petal.fall, height + 8)) - 4;
        rect(target, x, y, petal.shape === 0 ? 1 : 2, 1, petal.color);
        if (petal.shape === 2) rect(target, x, y + 1, 1, 1, petal.color);
      }

      // El ninja cruza los tejados corriendo y saltando, descansa fuera de la vista y vuelve.
      if (still) paintSprite(target, NINJA.stand, NINJA_COLORS, Math.round(width * 0.44), ridge - 12);
      else {
        const lap = t % (crossing + 3);
        if (lap < crossing) {
          const hop = (lap % 2.6) / 0.62;
          const air = hop < 1 ? Math.round(Math.sin(hop * Math.PI) * 10) : 0;
          const pose = air > 1 ? NINJA.jump : NINJA.run[Math.floor(t * 9) % 2];
          paintSprite(target, pose, NINJA_COLORS, Math.round(lap * 30) - 30, ridge - 12 - air);
        }
      }
    },
  };
}

/* ---------- Mundo 1 · El santuario ---------- */

const SHRINE_SKY = ["#03121a", "#061f27", "#0a2d35", "#0f3e44", "#165451", "#1f6d63", "#2c8a76"];
const SHRINE_STOPS = [0, 0.22, 0.42, 0.6, 0.75, 0.87, 0.95];

export const STONE_LANTERN: Sprite = [
  ".....d.....",
  "....dLd....",
  "..dLLLLLd..",
  ".dLmmmmmmd.",
  "...dmmmd...",
  "...L...d...",
  "...L...d...",
  "...L...d...",
  "..dLmmmmd..",
  "....Lmd....",
  "....Lmd....",
  "....Lmd....",
  "....Lmd....",
  "...dLmmd...",
  "..dLmmmmd..",
  ".dddddddd..",
];
const STONE_COLORS: Colors = { d: "#22393c", m: "#4e7173", L: "#8ab0ac" };

export const TALISMAN: Sprite = ["wwww", "wrww", "wwrw", "wrrw", "wwrw", "wrww", "wwww"];
const TALISMAN_COLORS: Colors = { w: "#f4ecc9", r: "#d64a32" };

/** Tira de papel en zigzag, de las que cuelgan de las cuerdas del santuario. */
export const STREAMER: readonly Sprite[] = [
  ["ww.", ".ww", "ww.", ".ww", "ww.", ".w."],
  [".ww", "ww.", ".ww", "ww.", ".ww", ".w."],
];
const STREAMER_COLORS: Colors = { w: "#f6f6ee" };

/** Un cedro: copa en capas que se van abriendo hacia abajo. */
function cedar(c: Ctx, x: number, base: number, tall: number, color: string, edge: string) {
  rect(c, x, base - 4, 1, 4, color);
  const top = base - 3 - tall;
  for (let row = 0; row < tall; row++) {
    const rowWidth = 1 + Math.floor(row / 5) * 2 + (row % 5);
    const left = x - (rowWidth >> 1);
    rect(c, left, top + row, rowWidth, 1, color);
    // La luna está a la izquierda: el borde de cada capa de ese lado recibe luz.
    if (row % 5 === 4) rect(c, left, top + row, 1, 1, edge);
  }
}

/** El portal rojo del santuario, con su cuerda entre los dos postes. */
function gate(c: Ctx, cx: number, base: number) {
  const red = "#d9412c";
  const redDark = "#992a22";
  const redLight = "#ff7e5e";
  const cap = "#190e13";
  const top = base - 54;
  for (const side of [-1, 1]) {
    const x = cx + side * 16 - 2;
    rect(c, x, top + 8, 4, 46, red);
    rect(c, x + 3, top + 8, 1, 46, redDark);
    rect(c, x, top + 8, 1, 46, redLight);
    rect(c, x - 1, base - 3, 6, 3, "#1b2f31");
    rect(c, x - 1, base - 3, 6, 1, "#4e7173");
  }
  // Travesaño de arriba, con las puntas levantadas.
  for (let x = -31; x <= 31; x++) {
    const lift = Math.abs(x) > 28 ? 2 : Math.abs(x) > 23 ? 1 : 0;
    rect(c, cx + x, top - lift, 1, 2, cap);
    rect(c, cx + x, top + 2 - lift, 1, 3, red);
    rect(c, cx + x, top + 4 - lift, 1, 1, redDark);
  }
  rect(c, cx - 31, top - 2, 1, 1, "#3f5d5e");
  // Segundo travesaño y la tablilla del centro.
  rect(c, cx - 25, top + 14, 51, 4, red);
  rect(c, cx - 25, top + 14, 51, 1, redLight);
  rect(c, cx - 25, top + 17, 51, 1, redDark);
  rect(c, cx - 3, top + 5, 7, 9, cap);
  rect(c, cx - 2, top + 6, 5, 7, "#e9d9a0");
  rect(c, cx, top + 8, 1, 3, "#b89a52");
  // Cuerda que cuelga entre los postes.
  for (let x = -13; x <= 13; x++) {
    const y = top + 21 + Math.round(3 * (1 - (x / 13) * (x / 13)));
    rect(c, cx + x, y, 1, 2, x % 3 === 0 ? "#b9a56d" : "#e7d7a3");
  }
}

type Floater = { x: number; y: number; reach: number; lift: number; pace: number; phase: number };

function shrine(width: number, height: number): Scene {
  const random = seeded(1003);
  const back = layer(width, height);
  const front = layer(width, height);

  const ground = clamp(Math.round(height * 0.3), 60, 96);
  const horizon = height - ground;
  const floor = horizon + 22;
  const place = places(width);
  const moon = {
    x: place.wide ? Math.max(place.left, 46) : Math.round(width * 0.3),
    y: Math.round(horizon * 0.22),
    r: clamp(Math.round(Math.min(width, horizon) * 0.1), 9, 18),
  };

  /* Fondo: cielo, estrellas, luna menguante, colinas y los cedros lejanos. */
  let c = back.c;
  sky(c, width, horizon + 4, SHRINE_SKY, SHRINE_STOPS);
  rect(c, 0, horizon + 4, width, height - horizon - 4, SHRINE_SKY[SHRINE_SKY.length - 1]);
  const stars = scatterStars(c, random, width, Math.round(horizon * 0.75), 420, ["#6fb5b0", "#3f8c8a", "#a8e6dc"], moon);

  glow(c, moon.x, moon.y, moon.r - 1, moon.r + 9, "#1d5c5e", 0.5);
  const bite = moon.r * 0.92;
  disc(c, moon.x, moon.y, moon.r, "#e6fff3", (dx, dy) => Math.hypot(dx - moon.r * 0.5, dy + moon.r * 0.2) > bite);
  disc(c, moon.x, moon.y, moon.r, "#b9e9d8", (dx, dy) => {
    const distance = Math.hypot(dx - moon.r * 0.5, dy + moon.r * 0.2);
    return distance > bite && distance < bite + 1.6;
  });

  const hills = peaks(random, width, 8, 26, 60);
  for (let x = 0; x < width; x++) rect(c, x, horizon + 4 - hills[x], 1, hills[x], "#0d3a40");
  for (let x = -2 + Math.floor(random() * 4); x < width + 6; x += 5 + Math.floor(random() * 6)) {
    cedar(c, x, horizon + 8, 14 + Math.floor(random() * 16), "#0a2f35", "#16525a");
  }
  rect(c, 0, horizon + 6, width, height - horizon - 6, "#0a2f35");

  /* Delante: cedros cercanos, el patio, la escalera, el portal, los faroles y el árbol sagrado. */
  c = front.c;
  for (let x = Math.floor(random() * 6); x < width + 10; x += 9 + Math.floor(random() * 10)) {
    cedar(c, x, floor + 2, 26 + Math.floor(random() * 26), "#06232a", "#10454c");
  }
  rect(c, 0, floor, width, height - floor, "#0a2326");
  for (let row = 0; row < 6; row++) {
    c.fillStyle = "#143f40";
    for (let x = 0; x < width; x++) if (dither(x, floor + row, (6 - row) / 9)) c.fillRect(x, floor + row, 1, 1);
  }
  // Losas del patio.
  for (let y = floor + 8; y < height; y += 6) {
    for (let x = Math.floor(random() * 12); x < width; x += 10 + Math.floor(random() * 16)) {
      rect(c, x, y, 3 + Math.floor(random() * 6), 1, "#0f3133");
    }
  }

  const gateX = place.wide ? place.right : Math.round(width * 0.58);
  const gateBase = height - 30;
  // Escalera de piedra.
  for (let step = 0; gateBase + step * 5 < height; step++) {
    const half = 20 + step * 3;
    const y = gateBase + step * 5;
    rect(c, gateX - half, y, half * 2, 2, "#4d7375");
    rect(c, gateX - half, y, 3, 1, "#8ab0ac");
    rect(c, gateX - half, y + 2, half * 2, 3, "#2a484b");
    rect(c, gateX - half, y + 4, half * 2, 1, "#1b3033");
  }
  gate(c, gateX, gateBase);

  const stoneLanterns: { x: number; y: number; phase: number }[] = [];
  for (const side of [-1, 1]) {
    const x = gateX + side * 43 - 5;
    if (x > 20 && x < width - 12) stoneLanterns.push({ x, y: height - 30, phase: side > 0 ? 1 : 0 });
  }

  // Árbol sagrado en el borde izquierdo: un tronco enorme con su cuerda.
  const trunk = 15;
  const trunkWidth = (y: number) => trunk - Math.round((1 - y / height) * 5) + (y > height - 12 ? Math.round((y - height + 12) / 2) : 0);
  for (let y = 0; y < height; y++) {
    const w = trunkWidth(y);
    rect(c, 0, y, w, 1, "#05191c");
    // El canto que mira a la luna.
    rect(c, w - 1, y, 1, 1, y % 7 < 5 ? "#1c5357" : "#103a3e");
  }
  for (let x = 1; x < trunk - 3; x += 3) {
    for (let y = Math.floor(random() * 9); y < height; y += 6 + Math.floor(random() * 12)) {
      rect(c, x, y, 1, 3 + Math.floor(random() * 9), "#0e3438");
    }
  }
  const rope = height - 66;
  for (let x = 0; x <= trunkWidth(rope); x++) rect(c, x, rope, 1, 3, x % 3 === 1 ? "#b9a56d" : "#e7d7a3");

  // Hierba en primer plano.
  for (let x = 0; x < width; x += 2 + Math.floor(random() * 4)) {
    const tall = 2 + Math.floor(random() * 6);
    rect(c, x, height - tall, 1, tall, "#03110f");
    if (random() < 0.4) rect(c, x + 1, height - tall + 2, 1, tall - 2, "#03110f");
  }

  /* Niebla: una tira tramada que se repite y se desliza despacio. */
  const mistHeight = 22;
  const mistWidth = 64;
  const mist = layer(mistWidth, mistHeight);
  mist.c.fillStyle = "#3c9c88";
  for (let y = 0; y < mistHeight; y++) {
    const crest = Math.sin(((y + 0.5) / mistHeight) * Math.PI);
    for (let x = 0; x < mistWidth; x++) {
      const wave = 0.55 + 0.45 * Math.sin((x / mistWidth) * Math.PI * 2 + y * 0.35);
      if (dither(x, y, crest * wave * 0.5)) mist.c.fillRect(x, y, 1, 1);
    }
  }
  const drawMist = (target: Ctx, y: number, shift: number, alpha: number) => {
    target.globalAlpha = alpha;
    for (let x = -wrap(Math.round(shift), mistWidth); x < width; x += mistWidth) target.drawImage(mist.canvas, x, y);
    target.globalAlpha = 1;
  };

  /* Lo que se mueve. */
  const floater = (yFrom: number, yTo: number): Floater => ({
    x: 18 + random() * (width - 30),
    y: yFrom + random() * (yTo - yFrom),
    reach: 5 + random() * 9,
    lift: 3 + random() * 5,
    pace: 0.5 + random() * 0.7,
    phase: random() * 6.28,
  });
  const wisps = Array.from({ length: clamp(Math.round(width / 56), 2, 7) }, () => floater(horizon - 16, height - 44));
  const ghosts = Array.from({ length: clamp(Math.round(width / 70), 2, 6) }, (_, index) => ({
    ...floater(horizon - 34, height - 58),
    speed: (3 + random() * 4) * (index % 2 ? -1 : 1),
    blink: random() * 5,
  }));
  const talismans = Array.from({ length: clamp(Math.round(width / 46), 3, 10) }, () => ({
    x: 16 + random() * (width - 24),
    y: random() * height,
    rise: 4 + random() * 6,
    sway: 0.6 + random() * 0.9,
    phase: random() * 6.28,
  }));
  const fireflies = Array.from({ length: clamp(Math.round(width / 12), 8, 48) }, () => ({
    x: 16 + random() * (width - 18),
    y: horizon + random() * (ground - 6),
    pace: 0.4 + random() * 0.8,
    phase: random() * 6.28,
  }));
  const streamers = [
    ...[-8, 0, 8].map((offset) => ({ x: gateX + offset - 1, y: gateBase - 54 + 26 - Math.round((offset * offset) / 28) })),
    ...[2, 8].map((x) => ({ x, y: rope + 3 })),
  ];

  return {
    world: 1,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      target.drawImage(back.canvas, 0, 0);
      if (!still) twinkle(target, stars, time, "#eafff8", "#7fc8c0");
      drawMist(target, horizon - 4, t * 2.5, 0.85);
      target.drawImage(front.canvas, 0, 0);

      const beat = Math.floor(t * 5);
      for (const lantern of stoneLanterns) {
        const big = !still && (beat + lantern.phase) % 3 === 0;
        glow(target, lantern.x + 5, lantern.y + 6, 2, big ? 8 : 7, "#1c6f80", big ? 0.5 : 0.4);
        paintSprite(target, STONE_LANTERN, STONE_COLORS, lantern.x, lantern.y);
        rect(target, lantern.x + 4, lantern.y + 5, 3, 3, "#6fe9ff");
        rect(target, lantern.x + 5, lantern.y + (big ? 5 : 6), 1, 2, "#f0ffff");
      }
      for (const streamer of streamers) {
        const frame = still ? 0 : Math.floor(t * 1.6 + streamer.x) % 2;
        paintSprite(target, STREAMER[frame], STREAMER_COLORS, streamer.x, streamer.y);
      }

      for (const talisman of talismans) {
        const x = Math.round(talisman.x + Math.sin(t * talisman.sway + talisman.phase) * 6);
        const y = Math.round(height - wrap(talisman.y + t * talisman.rise, height + 12));
        target.globalAlpha = 0.9;
        paintSprite(target, TALISMAN, TALISMAN_COLORS, x, y);
        target.globalAlpha = 1;
      }

      for (const firefly of fireflies) {
        const pulse = Math.sin(t * firefly.pace * 2 + firefly.phase);
        if (!still && pulse < 0.2) continue;
        const x = Math.round(firefly.x + Math.sin(t * firefly.pace + firefly.phase) * 4);
        const y = Math.round(firefly.y + Math.cos(t * firefly.pace * 0.8 + firefly.phase) * 3);
        rect(target, x, y, 1, 1, pulse > 0.75 ? "#f4ffb0" : "#b7e36a");
      }

      for (const wisp of wisps) {
        const x = Math.round(wisp.x + Math.sin(t * wisp.pace + wisp.phase) * wisp.reach);
        const y = Math.round(wisp.y + Math.sin(t * wisp.pace * 1.7 + wisp.phase) * wisp.lift);
        glow(target, x + 3, y + 5, 3, 8, "#1f86a8", 0.5);
        paintSprite(target, WISP[still ? 0 : Math.floor(t * 6 + wisp.phase) % 2], WISP_COLORS, x, y);
      }

      for (const ghost of ghosts) {
        const x = Math.round(wrap(ghost.x + t * ghost.speed, width + 30)) - 15;
        const y = Math.round(ghost.y + Math.sin(t * ghost.pace * 2 + ghost.phase) * ghost.lift);
        const closed = !still && (t + ghost.blink) % 4.2 < 0.16;
        target.globalAlpha = 0.9;
        paintSprite(target, closed ? GHOST.blink : GHOST.open, GHOST_COLORS, x, y, ghost.speed < 0);
        target.globalAlpha = 1;
      }

      drawMist(target, height - 36, -t * 4, 0.45);
    },
  };
}
