/**
 * Cómo se acomoda el juego escondido en cada pantalla.
 *
 * Todo se mide en "píxeles del juego": un cuadrito del paisaje o del tablero. Aquí
 * se decide cuántos píxeles de la pantalla mide cada uno, para que el tablero
 * quepa entero y se vea lo más grande posible, y si el marcador va encima del
 * tablero (celular en vertical) o al lado (pantallas anchas).
 *
 * Son cuentas sin navegador de por medio, así que se pueden probar solas.
 */

import { FIELD_HEIGHT, FIELD_WIDTH, clamp } from "./art";

export type Mode = "retrato" | "lado";

export type Layout = {
  mode: Mode;
  /** Lado de un píxel del juego, en píxeles de la página. */
  unit: number;
  width: number;
  height: number;
  /** Cuántos píxeles de pantalla tiene cada píxel de página (2 o 3 en los celulares). */
  ratio: number;
  /** Pantalla táctil: se muestran los botones para jugar. */
  touch: boolean;
  /** Si el nombre del juego cabe arriba sin tapar el tablero. */
  brand: boolean;
  /** Cuánto bajar el marcador para que no quede debajo de los botones de arriba. */
  hudTop: number;
};

/** Alto de la barra de arriba y de los botones táctiles (en vertical), en píxeles de la página. */
export const TOP = 54;
export const PAD = 80;
/** Ancho de los dos grupos de botones táctiles cuando van en las esquinas (en horizontal). */
export const PAD_LEFT = 206;
export const PAD_RIGHT = 140;
/** Lo que ocupan, en píxeles del juego, el marcador encima del tablero y el marcador al lado. */
export const HUD_ABOVE = 36;
export const HUD_BESIDE = 60;
/** Márgenes mínimos alrededor, en píxeles de la página. */
const MARGIN_UPRIGHT = 12;
const MARGIN_SIDEWAYS = 16;

/**
 * Decide el acomodo para una ventana de `width` × `height` píxeles de página.
 * `ratio` es cuántos píxeles de pantalla tiene cada píxel de página (2 o 3 en los celulares).
 */
export function arrange(width: number, height: number, ratio: number, touch: boolean): Layout {
  // Cada píxel del juego debe ocupar un número entero de píxeles de la pantalla, para que se vea nítido.
  const snap = (value: number) => Math.max(1, Math.floor(value * ratio) / ratio);

  // En vertical: barra, marcador, tablero y botones, uno debajo del otro.
  const upright = snap(Math.min((width - MARGIN_UPRIGHT) / FIELD_WIDTH, (height - TOP - (touch ? PAD : 10)) / (FIELD_HEIGHT + HUD_ABOVE)));
  // En horizontal: tablero y marcador lado a lado, con los botones táctiles en las esquinas de abajo.
  const pads = touch ? PAD_LEFT + PAD_RIGHT : 0;
  const sideways = snap(Math.min((width - MARGIN_SIDEWAYS - pads) / (FIELD_WIDTH + HUD_BESIDE), (height - MARGIN_SIDEWAYS) / FIELD_HEIGHT));
  const mode: Mode = sideways > upright || (sideways === upright && width > height) ? "lado" : "retrato";
  const unit = mode === "lado" ? sideways : upright;

  let brand = true;
  let hudTop = 0;
  if (mode === "lado") {
    const span = (FIELD_WIDTH + HUD_BESIDE) * unit;
    const left = (touch ? PAD_LEFT : 0) + (width - pads - span) / 2;
    const top = (height - FIELD_HEIGHT * unit) / 2;
    if (top < TOP) {
      // Los botones de arriba a la derecha taparían el marcador: se baja un poco.
      if (left + span > width - 164) hudTop = Math.ceil(TOP - top);
      // El nombre de arriba a la izquierda taparía el tablero: no se muestra.
      if (left < 216) brand = false;
    }
  }
  return { mode, unit, width, height, ratio, touch, brand, hudTop };
}

export const sameLayout = (a: Layout, b: Layout) =>
  a.mode === b.mode &&
  a.unit === b.unit &&
  a.width === b.width &&
  a.height === b.height &&
  a.ratio === b.ratio &&
  a.touch === b.touch &&
  a.brand === b.brand &&
  a.hudTop === b.hudTop;

export type TitleSize = {
  /** Lado de un píxel de los textos de la portada, en píxeles de la página. */
  text: number;
  /** Cuántos píxeles del juego mide cada píxel del nombre grande. */
  logo: number;
  /** 2: el usuario va al doble de tamaño (si cabe a lo ancho). 1: tamaño normal. */
  handle: number;
  /** 2: todas las notas de abajo. 1: sin la ayuda de las teclas. 0: ninguna. */
  notes: number;
  /** Último recurso en pantallas muy pequeñas: menos aire entre los bloques y entre los botones. */
  tight: boolean;
};

/**
 * Formas de acomodar la portada, de la más holgada a la más apretada; se usa la
 * primera que quepa en la pantalla. Se va quitando en este orden: tamaño de los
 * textos, tamaño del usuario, ayuda de las teclas, tamaño del nombre, las notas y, al final, el aire entre los botones.
 */
export function titleSteps(layout: Layout): TitleSize[] {
  const full = Math.max(layout.unit, 2);
  const texts: number[] = [];
  for (let next = Math.ceil(full) - 1; next >= 2; next--) texts.push(next);
  const widest = clamp(Math.floor((layout.width / layout.unit - 12) / 31), 2, 6);
  const medium = Math.min(4, widest);

  let size: TitleSize = { text: full, logo: widest, handle: 2, notes: 2, tight: false };
  const steps = [size];
  const next = (change: Partial<TitleSize>) => {
    size = { ...size, ...change };
    steps.push(size);
  };
  for (const text of texts) if (text >= full * 0.6) next({ text });
  next({ handle: 1 });
  next({ notes: 1 });
  for (let logo = widest - 1; logo >= medium; logo--) next({ logo });
  for (const text of texts) if (text < full * 0.6) next({ text });
  next({ notes: 0 });
  next({ tight: true });
  for (let logo = medium - 1; logo >= 2; logo--) next({ logo });
  return steps;
}

/** Tamaños posibles de las letras del mensaje, del más grande al más pequeño (en píxeles de la página). */
export function letterSteps(unit: number): number[] {
  const full = Math.max(2, Math.floor(unit));
  return Array.from({ length: full - 1 }, (_, index) => full - index);
}
