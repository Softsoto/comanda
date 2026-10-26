/**
 * Mundo 2 · EL BOSQUE DE BAMBÚ.
 *
 * Anochece en un bosque de bambú. El cielo es verde azulado profundo y se va
 * aclarando hacia una luna grande y pálida, cruzada por jirones de neblina.
 * Hay cuatro filas de tallos: los de atrás, finos y desvaídos por la bruma; los
 * del medio, con sus nudos; y los de delante, gruesos, con brillo de luna en un
 * costado, anillos en cada nudo y hojas en abanico. Entre ellos sube un sendero
 * de piedras planas hasta un farol de piedra con luz cálida.
 *
 * Lo que se mueve: luciérnagas que titilan, hojas que caen girando despacio,
 * neblina que se desliza por el suelo y delante de la luna, la llama del farol
 * y, de vez en cuando, la silueta de Natha la ninja saltando de tallo en tallo
 * al fondo.
 *
 * Como en worlds.ts, lo fijo se pinta una vez en tres capas (fondo, medio y
 * delante) y en cada cuadro solo se copian y se dibuja lo que se mueve entre ellas.
 */

import {
  NINJA_COLORS,
  NINJA,
  clamp,
  dither,
  paintSprite,
  rect,
  seeded,
  type Colors,
  type Ctx,
  type Sprite,
} from "./art";
import {
  disc,
  glow,
  layer,
  line,
  places,
  scatterStars,
  sky,
  twinkle,
  wrap,
  type Scene,
} from "./scenery";

/* ---------- Colores ---------- */

// Arriba casi negro verdoso; abajo, cerca del horizonte, la bruma lo aclara.
const BAMBOO_SKY = [
  "#04110d",
  "#071a13",
  "#0b2419",
  "#103021",
  "#163b29",
  "#1e4932",
  "#29583c",
  "#376a48",
];
const BAMBOO_STOPS = [0, 0.15, 0.29, 0.43, 0.56, 0.68, 0.79, 0.89];

/** Cómo se ve una fila de tallos: más lejos, más clara y sin contraste (la bruma se la come). */
type StalkLook = {
  body: string;
  /** Costado en sombra. */
  dark: string;
  /** Costado que mira a la luna. */
  lit: string;
  /** Brillo fuerte (solo en los tallos gruesos). */
  shine?: string;
  /** Anillo del nudo y la sombra que deja debajo. */
  node: string;
  nodeDark: string;
  leaf: string;
  leafLit: string;
};

const FAR: StalkLook = {
  body: "#2f5a45",
  dark: "#2a5240",
  lit: "#3f6e55",
  node: "#4a7c60",
  nodeDark: "#284d3c",
  leaf: "#2c5642",
  leafLit: "#3c6a52",
};
const BACK: StalkLook = {
  body: "#1d3d2a",
  dark: "#173322",
  lit: "#33623f",
  node: "#467a4c",
  nodeDark: "#122a1b",
  leaf: "#1b3a27",
  leafLit: "#2f5a38",
};
const MIDDLE: StalkLook = {
  body: "#13301d",
  dark: "#0c2214",
  lit: "#3a7136",
  shine: "#4f8a3a",
  node: "#5f9a3c",
  nodeDark: "#08170d",
  leaf: "#15361d",
  leafLit: "#3c7232",
};
const NEAR: StalkLook = {
  body: "#10281a",
  dark: "#06120a",
  lit: "#3f7a2e",
  shine: "#7fb046",
  node: "#9fcf6a",
  nodeDark: "#040c07",
  leaf: "#12301a",
  leafLit: "#4f8a2e",
};

/** Luz cálida del farol, que tiñe lo que tiene cerca. */
const WARM = {
  lit: "#a8803e",
  glow: "#5a4a1c",
  flame: "#ffcf6a",
  core: "#fff3b0",
};

/** Farol de piedra: tejadillo, la ventanita de la llama (se pinta aparte) y el pie. */
const BAMBOO_LANTERN: Sprite = [
  ".....d.....",
  "....dLd....",
  "..dLLLLLd..",
  ".dLLLLLLLmd",
  "dmmmmmmmmmd",
  "..dmmmmmd..",
  "..dL...md..",
  "..dL...md..",
  "..dL...md..",
  "..dL...md..",
  ".dLmmmmmmd.",
  "..dddddd...",
  "...dLmmd...",
  "...dLmmd...",
  "...dLmmd...",
  "...dLmmd...",
  "..dLmmmmd..",
  ".dLmmmmmmd.",
  "ddddddddddd",
];
const BAMBOO_LANTERN_COLORS: Colors = {
  d: "#14211a",
  m: "#4a5f50",
  L: "#9a8a5c",
};

/** Natha a lo lejos: casi una sombra, solo la bufanda conserva un poco de color. */
const NINJA_SHADOW: Colors = {
  k: "#071510",
  b: "#0c1f15",
  B: "#3c6a50",
  s: "#0c1f15",
  e: "#071510",
  t: "#2aa891",
  T: "#167a68",
};

/**
 * Los colores de la sombra. Si la protagonista tiene un dibujo propio (con sus
 * propios colores), todo su dibujo se vuelve sombra, con un borde claro.
 */
function shadowColors(): Colors {
  if (Object.keys(NINJA_COLORS).every((key) => key in NINJA_SHADOW))
    return NINJA_SHADOW;
  return Object.fromEntries(
    Object.keys(NINJA_COLORS).map((key, index) => [
      key,
      index === 0 ? "#071510" : "#0f2419",
    ]),
  );
}

/* ---------- Piezas ---------- */

type Stalk = {
  x: number;
  base: number;
  top: number;
  w: number;
  lean: number;
  seg: number;
  phase: number;
};

/** Dónde está el centro de un tallo a cierta altura (los tallos se inclinan un poquito). */
const stalkX = (s: Stalk, y: number) => Math.round(s.x + (s.base - y) * s.lean);

/**
 * Un tallo de bambú, de abajo arriba. `light` dice de qué lado está la luna
 * (1 = derecha). Si hay farol cerca, la parte baja que lo mira se tiñe de cálido.
 */
function stalk(
  c: Ctx,
  s: Stalk,
  look: StalkLook,
  light: number,
  warm?: { x: number; y: number; r: number },
) {
  const half = s.w >> 1;
  for (let y = Math.max(0, s.top); y < s.base; y++) {
    const left = stalkX(s, y) - half;
    rect(c, left, y, s.w, 1, look.body);
    if (s.w >= 3) {
      rect(c, light > 0 ? left : left + s.w - 1, y, 1, 1, look.dark);
      rect(c, light > 0 ? left + s.w - 2 : left + 1, y, 1, 1, look.lit);
    } else if (s.w === 2)
      rect(c, light > 0 ? left + 1 : left, y, 1, 1, look.lit);
    // Brillo largo del tallo: una raya clara que se corta a ratos, como laca.
    if (look.shine && s.w >= 5 && (y + s.phase) % 11 < 7)
      rect(c, light > 0 ? left + s.w - 3 : left + 2, y, 1, 1, look.shine);
    if (s.w >= 7)
      rect(c, light > 0 ? left + 1 : left + s.w - 2, y, 1, 1, look.dark);
    if (warm) {
      const facing = warm.x > left + half ? left + s.w - 1 : left;
      const near = 1 - Math.hypot(facing - warm.x, y - warm.y) / warm.r;
      if (near > 0 && dither(facing, y, near * 1.3))
        rect(c, facing, y, 1, 1, WARM.lit);
    }
  }
  // Nudos: una raya oscura que sobresale y, debajo, el anillo claro.
  for (let y = s.base - s.phase; y > s.top; y -= s.seg) {
    const left = stalkX(s, y) - half;
    if (s.w >= 3) {
      rect(c, left - 1, y, s.w + 2, 1, look.nodeDark);
      rect(c, left, y + 1, s.w, 1, look.node);
      rect(c, light > 0 ? left : left + s.w - 1, y + 1, 1, 1, look.dark);
      if (s.w >= 6) rect(c, left, y - 1, s.w, 1, look.dark);
    } else rect(c, left, y, s.w, 1, look.node);
  }
}

/** Una hoja de bambú: larga y fina, más ancha en el medio, con el filo de arriba iluminado. */
function leaf(
  c: Ctx,
  x: number,
  y: number,
  angle: number,
  length: number,
  dir: number,
  look: StalkLook,
) {
  const dx = Math.cos(angle) * dir;
  const dy = Math.sin(angle);
  for (let i = 0; i <= length; i++) {
    const px = Math.round(x + dx * i);
    const py = Math.round(y + dy * i);
    rect(c, px, py, 1, 1, look.leaf);
    if (i > length * 0.18 && i < length * 0.72) {
      rect(c, px, py - 1, 1, 1, look.leafLit);
      if (length > 9 && i > length * 0.3 && i < length * 0.55)
        rect(c, px, py + 1, 1, 1, look.leaf);
    }
  }
}

/** Abanico de hojas: una ramita que sale del nudo y varias hojas que cuelgan de la punta. */
function fan(
  c: Ctx,
  random: () => number,
  x: number,
  y: number,
  dir: number,
  size: number,
  look: StalkLook,
) {
  const tipX = Math.round(x + dir * size * 0.55);
  const tipY = Math.round(y - size * 0.35);
  line(c, x, y, tipX, tipY, 1, look.dark);
  const count = 3 + Math.floor(random() * 3);
  for (let k = 0; k < count; k++) {
    // De casi horizontal a casi colgando: así se abre el abanico.
    const angle = -0.35 + (k / (count - 1)) * 1.45 + (random() - 0.5) * 0.2;
    leaf(
      c,
      tipX,
      tipY,
      angle,
      Math.round(size * (0.75 + random() * 0.45)),
      dir,
      look,
    );
  }
}

/** Una fila de tallos repartidos por el ancho, saltándose los sitios que hay que dejar libres. */
function stalkRow(
  random: () => number,
  width: number,
  opts: {
    gap: [number, number];
    w: [number, number];
    base: [number, number];
    seg: [number, number];
    lean: number;
    skip: (x: number, w: number) => boolean;
  },
) {
  const row: Stalk[] = [];
  for (
    let x = -4 + random() * opts.gap[0];
    x < width + 6;
    x += opts.gap[0] + random() * (opts.gap[1] - opts.gap[0])
  ) {
    const w = opts.w[0] + Math.floor(random() * (opts.w[1] - opts.w[0] + 1));
    if (opts.skip(x, w)) continue;
    const seg =
      opts.seg[0] + Math.floor(random() * (opts.seg[1] - opts.seg[0] + 1));
    row.push({
      x: Math.round(x),
      base: Math.round(opts.base[0] + random() * (opts.base[1] - opts.base[0])),
      top: -4,
      w,
      lean: (random() - 0.5) * opts.lean,
      seg,
      phase: 3 + Math.floor(random() * (seg - 3)),
    });
  }
  return row;
}

/** Tira de neblina tramada que se repite a lo ancho; se dibuja corrida para que parezca que avanza. */
function mistStrip(
  width: number,
  height: number,
  color: string,
  density: number,
) {
  const strip = layer(width, height);
  strip.c.fillStyle = color;
  for (let y = 0; y < height; y++) {
    const crest = Math.sin(((y + 0.5) / height) * Math.PI);
    for (let x = 0; x < width; x++) {
      const wave =
        0.5 +
        0.5 *
          Math.sin((x / width) * Math.PI * 2 + y * 0.4) *
          Math.cos((x / width) * Math.PI * 4 - y * 0.2);
      if (dither(x, y, crest * wave * density)) strip.c.fillRect(x, y, 1, 1);
    }
  }
  return (
    target: Ctx,
    sceneWidth: number,
    y: number,
    shift: number,
    alpha: number,
  ) => {
    target.globalAlpha = alpha;
    for (let x = -wrap(Math.round(shift), width); x < sceneWidth; x += width)
      target.drawImage(strip.canvas, x, y);
    target.globalAlpha = 1;
  };
}

type FallingLeaf = {
  x: number;
  y: number;
  fall: number;
  drift: number;
  sway: number;
  spin: number;
  phase: number;
  near: boolean;
};
type Firefly = {
  x: number;
  y: number;
  reach: number;
  pace: number;
  phase: number;
};
type Hop = { x: number; y: number };

/* ---------- El paisaje ---------- */

export function bamboo(width: number, height: number): Scene {
  const random = seeded(2202);
  const back = layer(width, height);
  const middle = layer(width, height);
  const front = layer(width, height);

  const ground = clamp(Math.round(height * 0.3), 60, 96);
  const horizon = height - ground;
  const place = places(width);
  const moon = {
    x: place.right,
    y: Math.max(18 + 16, Math.round(horizon * 0.3)),
    r: clamp(Math.round(Math.min(width, horizon) * 0.13), 11, 28),
  };
  // El sendero sube desde abajo hasta el fondo; el farol queda a su lado.
  const pathX = place.wide ? place.left : Math.round(width * 0.3);
  const pathTop = horizon + 8;
  const pathCenter = (y: number) => {
    const depth = (y - pathTop) / (height - pathTop);
    return (
      pathX + Math.sin(depth * 3.2 + 0.6) * (6 + depth * 10) + (1 - depth) * 6
    );
  };
  const pathHalf = (y: number) => 3 + ((y - pathTop) / (height - pathTop)) * 19;
  /** ¿Un tallo vertical en x taparía el sendero en algún punto? */
  const onPath = (x: number, w: number, from: number) => {
    for (let y = Math.max(from, pathTop); y < height; y += 4)
      if (Math.abs(x - pathCenter(y)) < pathHalf(y) + w) return true;
    return false;
  };
  const lantern = {
    x: Math.round(pathCenter(horizon + 36) + 18),
    y: horizon + 36 - 19,
  };
  const flame = { x: lantern.x + 5, y: lantern.y + 6 };
  const warm = { x: flame.x, y: flame.y, r: 30 };
  const light = (x: number) => (moon.x >= x ? 1 : -1);

  /* Fondo: cielo, estrellas, luna con neblina, bambú lejano y el suelo. */
  let c = back.c;
  sky(c, width, horizon + 4, BAMBOO_SKY, BAMBOO_STOPS);
  rect(c, 0, horizon + 4, width, ground, BAMBOO_SKY[BAMBOO_SKY.length - 1]);
  const stars = scatterStars(
    c,
    random,
    width,
    Math.round(horizon * 0.55),
    520,
    ["#6f9e86", "#4c7d66", "#a9d4b8"],
    moon,
  );

  // El cielo se aclara alrededor de la luna, en anillos tramados.
  glow(c, moon.x, moon.y, moon.r, moon.r + 34, "#1c4532", 0.55);
  glow(c, moon.x, moon.y, moon.r, moon.r + 20, "#2a5c42", 0.55);
  glow(c, moon.x, moon.y, moon.r, moon.r + 9, "#4a7d5c", 0.5);
  disc(c, moon.x, moon.y, moon.r, "#eef6dc");
  // Sombra suave del lado de abajo a la derecha y unas manchas: luna llena, pálida.
  disc(
    c,
    moon.x,
    moon.y,
    moon.r,
    "#d5e5bf",
    (dx, dy) =>
      Math.hypot(dx + moon.r * 0.32, dy + moon.r * 0.3) > moon.r * 1.05,
  );
  disc(
    c,
    moon.x - Math.round(moon.r * 0.3),
    moon.y - Math.round(moon.r * 0.22),
    Math.max(1, Math.round(moon.r * 0.2)),
    "#d9e8c4",
  );
  disc(
    c,
    moon.x + Math.round(moon.r * 0.32),
    moon.y + Math.round(moon.r * 0.18),
    Math.max(1, Math.round(moon.r * 0.15)),
    "#c9dcb1",
  );
  disc(
    c,
    moon.x - Math.round(moon.r * 0.05),
    moon.y + Math.round(moon.r * 0.5),
    Math.max(1, Math.round(moon.r * 0.12)),
    "#c9dcb1",
  );
  // Jirones fijos de neblina que cruzan la luna (otros se mueven encima).
  for (const [offset, thick, amount] of [
    [0.25, 2, 0.5],
    [0.55, 1, 0.35],
    [-0.45, 1, 0.3],
  ] as const) {
    const y0 = Math.round(moon.y + moon.r * offset);
    for (let y = y0; y < y0 + thick; y++) {
      for (let x = moon.x - moon.r * 2.4; x < moon.x + moon.r * 2.4; x++) {
        const fade = 1 - Math.abs(x - moon.x) / (moon.r * 2.4);
        if (dither(x, y, fade * amount))
          rect(c, Math.round(x), y, 1, 1, "#a9c9a6");
      }
    }
  }

  // Bruma tramada sobre el horizonte: lo más lejano se pierde en ella.
  for (let y = horizon - 40; y < horizon + 10; y++) {
    const amount = 1 - Math.abs(y - (horizon - 6)) / 34;
    c.fillStyle = "#3f7350";
    for (let x = 0; x < width; x++)
      if (dither(x, y, amount * 0.5)) c.fillRect(x, y, 1, 1);
  }

  // Fila lejana: tallos de un píxel, desvaídos. Pueden pasar delante de la luna, pero pocos.
  const far = stalkRow(random, width, {
    gap: [4, 9],
    w: [1, 2],
    base: [horizon - 2, horizon + 3],
    seg: [9, 13],
    lean: 0.04,
    skip: (x) => Math.abs(x - moon.x) < moon.r * 0.9 && random() < 0.75,
  });
  for (const s of far) {
    stalk(c, s, FAR, light(s.x));
    for (
      let y = s.base - s.phase - s.seg * 2;
      y > 2;
      y -= s.seg * (2 + Math.floor(random() * 2))
    ) {
      if (random() < 0.3)
        fan(c, random, stalkX(s, y), y, random() < 0.5 ? -1 : 1, 4, FAR);
    }
  }

  // Suelo: oscurece hacia abajo, con la bruma pegada arriba.
  rect(c, 0, horizon + 2, width, height - horizon - 2, "#163322");
  const soil = ["#163322", "#122b1c", "#0e2316", "#0b1c11"];
  soil.forEach((color, index) => {
    const from =
      horizon + 2 + Math.round(((height - horizon) * index) / soil.length);
    rect(c, 0, from, width, height - from, color);
    c.fillStyle = color;
    for (let y = from - 3; y < from; y++)
      for (let x = 0; x < width; x++)
        if (dither(x, y, (y - from + 4) / 5)) c.fillRect(x, y, 1, 1);
  });
  c.fillStyle = "#3f7350";
  for (let y = horizon + 2; y < horizon + 8; y++)
    for (let x = 0; x < width; x++)
      if (dither(x, y, (horizon + 8 - y) / 9)) c.fillRect(x, y, 1, 1);
  // Musgo: manchitas claras sueltas por el suelo.
  for (let index = 0; index < (width * ground) / 40; index++) {
    const y = horizon + 6 + Math.floor(random() * (ground - 6));
    rect(
      c,
      Math.floor(random() * width),
      y,
      1 + Math.floor(random() * 3),
      1,
      y < horizon + 30 ? "#1f4429" : "#173a22",
    );
  }

  // Segunda fila: algo más gruesa y oscura, con nudos que ya se ven.
  const backRow = stalkRow(random, width, {
    gap: [7, 15],
    w: [2, 3],
    base: [horizon + 5, horizon + 10],
    seg: [12, 17],
    lean: 0.05,
    skip: (x) => Math.abs(x - moon.x) < moon.r + 1,
  });
  for (const s of backRow) {
    stalk(c, s, BACK, light(s.x));
    for (let y = s.base - s.phase - s.seg; y > 0; y -= s.seg) {
      if (random() < (y < horizon * 0.5 ? 0.65 : 0.25))
        fan(c, random, stalkX(s, y), y, random() < 0.5 ? -1 : 1, 6, BACK);
    }
  }

  /* Medio: la tercera fila de tallos, el sendero de piedras y el farol. */
  c = middle.c;
  // La luz del farol tiñe el suelo a su alrededor.
  glow(c, flame.x, lantern.y + 19, 2, 26, "#2f3a1a", 0.5);
  glow(c, flame.x, lantern.y + 19, 2, 16, WARM.glow, 0.35);

  const midRow = stalkRow(random, width, {
    gap: [12, 24],
    w: [3, 5],
    base: [horizon + 12, horizon + 22],
    seg: [15, 21],
    lean: 0.05,
    skip: (x, w) =>
      Math.abs(x - moon.x) < moon.r + w + 2 ||
      onPath(x, w + 2, horizon + 12) ||
      Math.abs(x - flame.x) < 9,
  });
  for (const s of midRow) {
    stalk(c, s, MIDDLE, light(s.x), warm);
    for (let y = s.base - s.phase - s.seg; y > 0; y -= s.seg) {
      if (random() < (y < horizon * 0.45 ? 0.75 : 0.2))
        fan(
          c,
          random,
          stalkX(s, y) + (s.w >> 1),
          y,
          random() < 0.5 ? -1 : 1,
          8,
          MIDDLE,
        );
    }
  }

  // Matas de hierba y brotes de bambú por el suelo (fuera del sendero).
  for (let index = 0; index < width / 9; index++) {
    const x = Math.floor(random() * width);
    const y = horizon + 12 + Math.floor(random() * (ground - 14));
    if (
      Math.abs(x - pathCenter(y)) < pathHalf(y) + 4 ||
      Math.abs(x - flame.x) < 7
    )
      continue;
    const depth = (y - horizon) / ground;
    if (random() < 0.25) {
      // Brote: un cono pequeño con vainas, oscuro con el filo claro.
      const tall = 3 + Math.round(depth * 5);
      for (let row = 0; row < tall; row++) {
        const half = Math.floor((row * 2) / tall + (row > tall / 2 ? 1 : 0));
        rect(
          c,
          x - half,
          y - tall + row,
          half * 2 + 1,
          1,
          row % 3 === 2 ? "#2a3a1c" : "#3c4e26",
        );
        rect(c, x + half, y - tall + row, 1, 1, "#7a8a3e");
      }
    } else {
      const blades = 3 + Math.floor(random() * 3);
      const tall = 2 + Math.round(depth * 5 + random() * 2);
      for (let k = 0; k < blades; k++) {
        const tip = x + Math.round((k - (blades - 1) / 2) * 1.5);
        line(
          c,
          x,
          y,
          tip,
          y - tall + Math.abs(tip - x),
          1,
          depth > 0.5 ? "#173a20" : "#1f4429",
        );
        rect(c, tip, y - tall + Math.abs(tip - x), 1, 1, "#3f7a2e");
      }
    }
  }

  // Piedras planas del sendero: de cerca grandes, de lejos pequeñas y juntas.
  let side = 1;
  for (let y = height - 3; y > pathTop;) {
    const depth = (y - pathTop) / (height - pathTop);
    // Piedras de tamaño desigual, corridas a un lado y al otro, como pasaderas.
    const half = Math.max(2, Math.round(pathHalf(y) * (0.4 + random() * 0.3)));
    const tall = Math.max(1, Math.round(1 + depth * 4.5));
    side = -side;
    const cx = Math.round(
      pathCenter(y) + side * pathHalf(y) * (0.2 + random() * 0.25),
    );
    for (let row = 0; row < tall; row++) {
      // Esquinas redondeadas: las filas de arriba y abajo son más cortas.
      const cut = row === 0 || row === tall - 1 ? Math.min(2, half >> 1) : 0;
      rect(
        c,
        cx - half + cut,
        y - tall + row,
        half * 2 - cut * 2,
        1,
        row === tall - 1 ? "#2a3a30" : "#4a5e50",
      );
    }
    const lit = Math.hypot(cx - warm.x, y - warm.y) < warm.r * 0.75;
    const topCut = Math.min(2, half >> 1);
    rect(
      c,
      cx - half + topCut,
      y - tall,
      half * 2 - topCut * 2,
      1,
      lit ? "#e0b866" : "#8fae96",
    );
    if (tall > 2)
      rect(c, cx - half + 2, y - tall + 1, 3, 1, lit ? "#a8905a" : "#6a8672");
    rect(c, cx - half + topCut, y, half * 2 - topCut * 2, 1, "#08140c");
    y -= tall + 1 + Math.round(depth * 3);
  }

  paintSprite(c, BAMBOO_LANTERN, BAMBOO_LANTERN_COLORS, lantern.x, lantern.y);
  rect(c, lantern.x - 1, lantern.y + 19, 13, 1, "#08140c");

  /* Delante: los tallos gruesos, con hojas en abanico, y matas en el suelo. */
  c = front.c;
  const nearRow = stalkRow(random, width, {
    gap: place.wide ? [26, 48] : [22, 38],
    w: [6, 9],
    base: [height + 2, height + 2],
    seg: [22, 30],
    lean: 0.03,
    skip: (x, w) =>
      Math.abs(x - moon.x) < moon.r + w + 4 ||
      onPath(x, w, 0) ||
      Math.abs(x - flame.x) < 12,
  });
  // Dos tallos enormes, cortados por los bordes, enmarcan el paisaje.
  nearRow.push({
    x: 2,
    base: height + 2,
    top: -4,
    w: 11,
    lean: 0.012,
    seg: 34,
    phase: 12,
  });
  nearRow.push({
    x: width - 3,
    base: height + 2,
    top: -4,
    w: 12,
    lean: -0.012,
    seg: 31,
    phase: 20,
  });
  for (const s of nearRow) {
    stalk(c, s, NEAR, light(s.x), warm);
    for (let y = s.base - s.phase - s.seg; y > -4; y -= s.seg) {
      // Las hojas abundan arriba (la copa) y escasean abajo.
      const chance = y < horizon * 0.4 ? 0.95 : y < horizon * 0.75 ? 0.5 : 0.15;
      const side = random() < 0.5 ? -1 : 1;
      if (random() < chance)
        fan(
          c,
          random,
          stalkX(s, y) + side * (s.w >> 1),
          y,
          side,
          10 + Math.floor(random() * 4),
          NEAR,
        );
      if (y < horizon * 0.3 && random() < 0.6)
        fan(c, random, stalkX(s, y) - side * (s.w >> 1), y + 2, -side, 9, NEAR);
    }
  }
  // Matas de hierba y brotes en el borde de abajo.
  for (let x = 0; x < width; x += 2 + Math.floor(random() * 5)) {
    if (Math.abs(x - pathCenter(height - 2)) < 12) continue;
    const tall = 2 + Math.floor(random() * 7);
    const lean = random() < 0.5 ? -1 : 1;
    line(
      c,
      x,
      height,
      x + lean * Math.floor(tall / 3),
      height - tall,
      1,
      "#06120a",
    );
    if (random() < 0.3)
      rect(c, x + lean * Math.floor(tall / 3), height - tall, 1, 1, "#2f5e26");
  }

  /* Lo que se mueve. */
  const drawGroundMist = mistStrip(72, 16, "#7fae8c", 0.55);
  const drawLowMist = mistStrip(96, 20, "#8fbf9c", 0.5);
  const drawMoonMist = mistStrip(84, 6, "#b9d8b0", 0.7);

  const leaves: FallingLeaf[] = Array.from(
    { length: clamp(Math.round(width / 14), 7, 40) },
    () => ({
      x: random() * (width + 10),
      y: random() * (height + 10),
      fall: 3 + random() * 4,
      drift: 1.5 + random() * 3,
      sway: 0.5 + random() * 0.6,
      spin: 0.9 + random() * 1.4,
      phase: random() * 6.28,
      near: random() < 0.4,
    }),
  );
  const fireflies: Firefly[] = Array.from(
    { length: clamp(Math.round(width / 11), 9, 56) },
    () => ({
      x: 6 + random() * (width - 12),
      y: horizon - 34 + random() * (ground + 22),
      reach: 3 + random() * 6,
      pace: 0.25 + random() * 0.5,
      phase: random() * 6.28,
    }),
  );

  // El recorrido de Natha: de tallo en tallo de la segunda fila, colgada a media altura.
  const hops: Hop[] = [];
  let lastX = -40;
  for (const s of [...backRow].sort((a, b) => a.x - b.x)) {
    if (s.x - lastX < 26) continue;
    const y = Math.round(horizon * (0.62 + random() * 0.14));
    hops.push({ x: stalkX(s, y) - 6, y });
    lastX = s.x;
  }
  hops.unshift({ x: -16, y: hops[0]?.y ?? horizon >> 1 });
  hops.push({ x: width + 4, y: hops[hops.length - 1].y });
  const HOP = 0.75; // segundos en el aire
  const CLING = 0.5; // segundos agarrada al tallo
  const trip = (hops.length - 1) * (HOP + CLING);
  const cycle = trip + 16; // y luego desaparece un buen rato

  return {
    world: 2,
    width,
    height,
    paint(target, time, still = false) {
      const t = still ? 0 : time / 1000;
      target.drawImage(back.canvas, 0, 0);
      if (!still) twinkle(target, stars, time, "#e8ffe0", "#7fb894");
      // La neblina de la luna solo pasa por delante de ella, no por todo el cielo.
      target.save();
      target.beginPath();
      target.rect(moon.x - moon.r * 2, 0, moon.r * 4, height);
      target.clip();
      drawMoonMist(target, width, moon.y - 2, t * 1.5, 0.55);
      target.restore();
      drawGroundMist(target, width, horizon - 8, t * 2.2, 0.6);

      // Natha salta al fondo: de vez en cuando, y en sentido distinto cada vez.
      const round = Math.floor(t / cycle);
      const lap = t % cycle;
      if (still) {
        const rest = hops[Math.min(2, hops.length - 2)];
        paintSprite(target, NINJA.stand, shadowColors(), rest.x, rest.y - 6);
      } else if (lap < trip) {
        const reverse = round % 2 === 1;
        const step = Math.floor(lap / (HOP + CLING));
        const inStep = lap - step * (HOP + CLING);
        const from = hops[reverse ? hops.length - 1 - step : step];
        const to = hops[reverse ? hops.length - 2 - step : step + 1];
        if (inStep < CLING)
          paintSprite(
            target,
            NINJA.stand,
            shadowColors(),
            from.x,
            from.y - 6,
            reverse,
          );
        else {
          const k = (inStep - CLING) / HOP;
          const x = Math.round(from.x + (to.x - from.x) * k);
          const y =
            Math.round(
              from.y + (to.y - from.y) * k - Math.sin(k * Math.PI) * 14,
            ) - 6;
          paintSprite(target, NINJA.jump, shadowColors(), x, y, reverse);
        }
      }

      target.drawImage(middle.canvas, 0, 0);

      // La llama del farol: tiembla un poco y su halo crece y decrece.
      const flicker = still ? 0 : Math.floor(t * 6) % 5;
      glow(
        target,
        flame.x,
        flame.y + 2,
        3,
        flicker === 0 ? 10 : 9,
        "#8a6a26",
        0.45,
      );
      rect(target, flame.x - 1, flame.y, 3, 4, WARM.flame);
      rect(target, flame.x, flame.y + (flicker === 2 ? 1 : 2), 1, 2, WARM.core);

      for (const firefly of fireflies) {
        const pulse = Math.sin(t * firefly.pace * 3 + firefly.phase);
        if (!still && pulse < 0.1) continue;
        const x = Math.round(
          firefly.x +
            Math.sin(t * firefly.pace + firefly.phase) * firefly.reach,
        );
        const y = Math.round(
          firefly.y + Math.cos(t * firefly.pace * 0.7 + firefly.phase) * 3,
        );
        if (pulse > 0.7 || still) {
          target.fillStyle = "#5f8f34";
          target.fillRect(x - 1, y, 1, 1);
          target.fillRect(x + 1, y, 1, 1);
          target.fillRect(x, y - 1, 1, 1);
          target.fillRect(x, y + 1, 1, 1);
          rect(target, x, y, 1, 1, "#f4ffb0");
        } else rect(target, x, y, 1, 1, "#a8d45e");
      }

      target.drawImage(front.canvas, 0, 0);

      // Hojas que caen girando: una rayita que cambia de ángulo, con la punta iluminada.
      for (const fallen of leaves) {
        const x =
          Math.round(
            wrap(
              fallen.x +
                t * fallen.drift +
                Math.sin(t * fallen.sway + fallen.phase) * 6,
              width + 10,
            ),
          ) - 5;
        const y = Math.round(wrap(fallen.y + t * fallen.fall, height + 10)) - 5;
        const angle = t * fallen.spin + fallen.phase;
        const length = fallen.near ? 3 : 2;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle) * 0.5;
        for (let i = -length; i <= length; i++) {
          const color =
            i === -length
              ? fallen.near
                ? "#c4e8b0"
                : "#8fbf4a"
              : fallen.near
                ? "#6fae45"
                : "#4f8a2e";
          rect(
            target,
            Math.round(x + dx * i * 0.8),
            Math.round(y + dy * i),
            1,
            1,
            color,
          );
        }
      }

      drawLowMist(target, width, height - 26, -t * 3, 0.32);
    },
  };
}
