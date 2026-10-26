/**
 * Lo que comparten los juegos pequeños de "Dos Lunas" (todos menos Torre de Luna).
 *
 * Cada juego vive en su propio archivo de esta carpeta y exporta un `MiniGameDef`:
 * cómo empieza una partida, cómo avanza con los controles, cómo se dibuja en un
 * lienzo de 128 × 224 píxeles y cómo va el marcador. MiniGame.tsx se encarga del
 * reloj, el teclado, los toques y los botones de la pantalla.
 */

import type { Ctx } from "../art";

/** Controles con nombre propio. "left2"/"right2" son del segundo jugador (teclas A y D) cuando juegan dos. */
export type Key = "left" | "right" | "up" | "down" | "fire" | "left2" | "right2";
export type Dir = "left" | "right" | "up" | "down";
export type Point = { x: number; y: number };

/** Lo que hizo el jugador desde el paso anterior. Las posiciones están en píxeles del lienzo (0–127, 0–223). */
export type Input = {
  /** Teclas o botones que siguen apretados. */
  held: ReadonlySet<Key>;
  /** Teclas o botones que se acaban de apretar (una vez por pulsación). */
  pressed: readonly Key[];
  /** Toques o clics que empezaron sobre el tablero. */
  taps: readonly Point[];
  /** Dónde hay dedos (o el ratón apretado) sobre el tablero ahora mismo. */
  touches: readonly Point[];
  /** Deslizamientos del dedo sobre el tablero (para mover sin botones). */
  swipes: readonly Dir[];
};

/** Sonidos disponibles (los mismos de bleeps.ts). */
export type Sound = "move" | "rotate" | "drop" | "lock" | "clear" | "clear2" | "level" | "letter" | "start" | "over";

/** Por dónde avisa un juego lo que pasó en un paso. */
export type Out = {
  sound(name: Sound): void;
  /** Aviso para quien usa lector de pantalla (cambio de nivel, vidas, etc.). */
  say(text: string): void;
  /** Se ganó el mensaje secreto de este juego (normalmente, al juntar NATHALIA). */
  secret(): void;
};

export type Status = {
  score: number;
  lives: number;
  level: number;
  /** Letras de NATHALIA juntadas (0 a 8), si el juego las usa. */
  letters: number;
  /** El paisaje de fondo que toca (0 a 4). */
  world: number;
  over: boolean;
  /** Texto para el aviso final en vez del de siempre (por ejemplo, quién ganó un duelo). */
  result?: string;
};

export type PadButton = { key: Key; glyph: string; label: string; main?: boolean };

export type MiniGameDef<S> = {
  /** "1" o "2" jugadores en el duelo; los demás juegos tienen un solo modo, "1". */
  create(seed: number, mode: string): S;
  step(state: S, dt: number, input: Input, out: Out): void;
  draw(c: Ctx, state: S, time: number, still: boolean): void;
  status(state: S): Status;
  /** Botones táctiles: dos grupos, a la izquierda y a la derecha de la pantalla. */
  pad(mode: string): PadButton[][];
  /** Cómo se juega, para lectores de pantalla (se lee al enfocar el tablero). */
  help: string;
  /**
   * Píxeles del lienzo por cada píxel del tablero (1 si no se dice). Con 2, el juego dibuja en
   * 256 × 448 dentro del mismo espacio en pantalla: el doble de detalle. Los toques llegan en esas
   * mismas medidas.
   */
  resolution?: number;
  /** Un estado para la miniatura del menú, sin leer ni guardar nada (si no está, se usa create). */
  preview?(seed: number): S;
  /** Si juegan dos personas en este modo (entonces A y D son del segundo jugador y no hay puntaje que guardar). */
  twoPlayers?(mode: string): boolean;
};

/** Para que TypeScript revise cada juego sin perder el tipo de su estado. */
export const defineGame = <S>(def: MiniGameDef<S>) => def as unknown as MiniGameDef<unknown>;

/** Azar con semilla, guardado dentro del estado (así las partidas se pueden repetir en las pruebas). */
export function roll(state: { random: number }): number {
  state.random = (state.random + 0x6d2b79f5) >>> 0;
  let t = state.random;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Un `Input` vacío, con lo que se le quiera cambiar (útil en las pruebas). */
export const noInput = (change: Partial<Input> = {}): Input => ({ held: new Set(), pressed: [], taps: [], touches: [], swipes: [], ...change });
/** Un `Out` que no hace nada, o que anota todo en `log` (útil en las pruebas). */
export const quietOut = (log?: string[]): Out => ({
  sound: (name) => log?.push(`sound:${name}`),
  say: (text) => log?.push(`say:${text}`),
  secret: () => log?.push("secret"),
});
