/**
 * Herramientas para pintar los paisajes del juego escondido: cielos por franjas,
 * lunas, resplandores, cordilleras, estrellas que titilan. Cada paisaje está en
 * su propio archivo (worlds.ts y worlds-*.ts) y se arma con estas piezas.
 */

import { dither, makeCanvas, rect, type Ctx } from "./art";

export type Scene = {
  world: number;
  width: number;
  height: number;
  /** Pinta el paisaje en el instante `time` (en milisegundos). Con `still`, todo quieto. */
  paint(c: Ctx, time: number, still?: boolean): void;
};

export type Layer = { canvas: HTMLCanvasElement; c: Ctx };

export function layer(width: number, height: number): Layer {
  const canvas = makeCanvas(width, height);
  return { canvas, c: canvas.getContext("2d") as Ctx };
}

/** Cielo por franjas de color, con el paso de una a otra tramado para que no se note el corte. */
export function sky(c: Ctx, width: number, bottom: number, colors: readonly string[], stops: readonly number[]) {
  for (let index = 0; index < colors.length; index++) {
    const from = Math.round(bottom * stops[index]);
    const to = index + 1 < colors.length ? Math.round(bottom * stops[index + 1]) : bottom;
    rect(c, 0, from, width, to - from, colors[index]);
  }
  for (let index = 1; index < colors.length; index++) {
    const edge = Math.round(bottom * stops[index]);
    for (let row = -4; row < 4; row++) {
      const y = edge + row;
      // Encima del corte se asoma el color nuevo; debajo se queda algo del anterior.
      c.fillStyle = row < 0 ? colors[index] : colors[index - 1];
      const amount = row < 0 ? (row + 5) / 10 : (5 - row) / 10;
      for (let x = 0; x < width; x++) if (dither(x, y, amount)) c.fillRect(x, y, 1, 1);
    }
  }
}

/** Círculo de píxeles. `keep` permite recortarlo (para la luna menguante o las sombras). */
export function disc(c: Ctx, cx: number, cy: number, radius: number, color: string, keep?: (dx: number, dy: number) => boolean) {
  c.fillStyle = color;
  const limit = radius * radius + radius * 0.8;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= limit && (!keep || keep(dx, dy))) c.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

/** Resplandor tramado alrededor de un punto: más denso cerca y se pierde hacia afuera. */
export function glow(c: Ctx, cx: number, cy: number, inner: number, outer: number, color: string, strength = 0.6) {
  c.fillStyle = color;
  for (let dy = -outer; dy <= outer; dy++) {
    for (let dx = -outer; dx <= outer; dx++) {
      const distance = Math.hypot(dx, dy);
      if (distance < inner || distance > outer) continue;
      if (dither(cx + dx, cy + dy, (1 - (distance - inner) / (outer - inner)) * strength)) c.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

/** Línea de un punto a otro, del grosor que se pida. */
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, thickness: number, color: string) {
  c.fillStyle = color;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(x0 + ((x1 - x0) * step) / steps);
    const y = Math.round(y0 + ((y1 - y0) * step) / steps);
    c.fillRect(x - (thickness >> 1), y - (thickness >> 1), thickness, thickness);
  }
}

/** Perfil de una cordillera: la altura de cada columna, hecha de picos al azar. */
export function peaks(random: () => number, width: number, low: number, high: number, gap: number): number[] {
  const heights = Array<number>(width).fill(2);
  let x = -gap * random();
  while (x < width + gap) {
    const top = low + random() * (high - low);
    const slope = 0.45 + random() * 0.5;
    for (let column = 0; column < width; column++) {
      heights[column] = Math.max(heights[column], Math.floor(top - Math.abs(column - x) * slope));
    }
    x += gap * (0.6 + random() * 0.9);
  }
  return heights;
}

export type Star = { x: number; y: number; big: boolean; phase: number };

/** Estrellas quietas (tenues); las que titilan se repintan más brillantes de vez en cuando. */
export function scatterStars(
  c: Ctx,
  random: () => number,
  width: number,
  bottom: number,
  density: number,
  tints: readonly string[],
  avoid: { x: number; y: number; r: number },
) {
  const stars: Star[] = [];
  const count = Math.round((width * bottom) / density);
  for (let index = 0; index < count; index++) {
    const x = Math.floor(random() * width);
    // Dos tiradas multiplicadas: salen más estrellas arriba que cerca del horizonte.
    const y = Math.floor(random() * random() * bottom);
    const big = random() < 0.09;
    const tint = tints[Math.floor(random() * tints.length)];
    if (Math.hypot(x - avoid.x, y - avoid.y) < avoid.r + 10) continue;
    stars.push({ x, y, big, phase: Math.floor(random() * 9) });
    rect(c, x, y, 1, 1, tint);
  }
  return stars;
}

export function twinkle(c: Ctx, stars: readonly Star[], time: number, bright: string, soft: string) {
  const beat = Math.floor(time / 380);
  for (const star of stars) {
    const moment = (beat + star.phase) % 9;
    if (moment > 1) continue;
    rect(c, star.x, star.y, 1, 1, bright);
    if (star.big && moment === 0) {
      c.fillStyle = soft;
      c.fillRect(star.x - 1, star.y, 1, 1);
      c.fillRect(star.x + 1, star.y, 1, 1);
      c.fillRect(star.x, star.y - 1, 1, 1);
      c.fillRect(star.x, star.y + 1, 1, 1);
    }
  }
}

/** Resto positivo: para que lo que sale por un lado de la pantalla vuelva a entrar por el otro. */
export const wrap = (value: number, size: number) => ((value % size) + size) % size;

/**
 * Dónde poner lo principal de cada paisaje. En pantallas anchas el tablero queda
 * en el centro, así que la torre, la luna o el portal van a los lados para que
 * se sigan viendo durante la partida; en el celular se reparten por el ancho.
 */
export function places(width: number) {
  const wide = width >= 300;
  return {
    left: wide ? Math.round(width / 4 - 50) : Math.round(width * 0.26),
    right: wide ? Math.round(width * 0.75 + 50) : Math.round(width * 0.72),
    wide,
  };
}
