"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Ctx } from "./art";
import type { Bleeps } from "./bleeps";
import { MINI_GAMES, type MiniId } from "./games";
import { HEIGHT, WIDTH } from "./games/kit";
import type { Dir, Input, Key, Out, Point, Status } from "./games/types";

/**
 * Los juegos pequeños de "Dos Lunas", todos en un lienzo de 128 × 224 píxeles.
 * Cada juego está en su archivo de la carpeta games/; aquí van el reloj, el
 * teclado, los toques sobre el tablero y los avisos hacia la pantalla principal.
 */

export type { MiniId };
export type MiniHandle = {
  /** Una tecla del teclado (por su nombre, como "ArrowLeft") o un control con nombre propio. Devuelve si el juego la usa. */
  key: (name: string, down: boolean) => boolean;
};

type Props = {
  game: MiniId;
  /** "1" o "2" jugadores (solo cuenta en el duelo). */
  mode: string;
  /** false: la partida está en pausa (o hay un aviso encima). */
  running: boolean;
  /** Sin animaciones de adorno, para quien las tiene desactivadas. */
  still: boolean;
  sounds: () => Bleeps;
  /** El paisaje de fondo que toca. */
  onWorld: (world: number) => void;
  /** Se ganó el mensaje secreto de este juego. */
  onSecret: () => void;
  onOver: (status: Status) => void;
  /** Avisos para quien usa lector de pantalla. */
  onStatus: (text: string) => void;
};

const CONTROLS: readonly Key[] = ["left", "right", "up", "down", "fire", "left2", "right2"];

/** Teclas del teclado → controles. A y D son del segundo jugador cuando juegan dos. */
function keyFor(name: string, twoPlayers: boolean): Key | null {
  if ((CONTROLS as readonly string[]).includes(name)) return name as Key;
  switch (name.length === 1 ? name.toLowerCase() : name) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
    case "w":
      return "up";
    case "ArrowDown":
    case "s":
      return "down";
    case "a":
      return twoPlayers ? "left2" : "left";
    case "d":
      return twoPlayers ? "right2" : "right";
    case " ":
    case "Enter":
    case "x":
    case "z":
      return "fire";
    default:
      return null;
  }
}

export const MiniGame = forwardRef<MiniHandle, Props>(function MiniGame(props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const def = MINI_GAMES[props.game];
  const twoPlayers = def.twoPlayers?.(props.mode) ?? false;
  /** Algunos juegos dibujan con más detalle (ver `resolution`). */
  const scale = def.resolution ?? 1;
  const live = useRef({
    state: null as unknown,
    held: new Set<Key>(),
    pressed: [] as Key[],
    taps: [] as Point[],
    swipes: [] as Dir[],
    pointers: new Map<number, { now: Point; from: Point; at: number }>(),
    world: -1,
    done: false,
  });

  useImperativeHandle(ref, () => ({
    key(name, down) {
      const key = keyFor(name, twoPlayers);
      if (!key) return false;
      const input = live.current;
      if (down && !input.held.has(key)) input.pressed.push(key);
      if (down) input.held.add(key);
      else input.held.delete(key);
      return true;
    },
  }));

  // Al pausar se sueltan los botones: al volver, nadie sale andando solo.
  useEffect(() => {
    if (props.running) return;
    const input = live.current;
    input.held.clear();
    input.pressed = [];
    input.taps = [];
    input.swipes = [];
    input.pointers.clear();
  }, [props.running]);

  useEffect(() => {
    const input = live.current;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    input.state = def.create(seed, props.mode);
    const started = performance.now();
    let last = started;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const { running, still, sounds, onWorld, onSecret, onOver, onStatus } = latest.current;
      // El primer cuadro puede traer una hora anterior a la de arranque: nunca se retrocede.
      const dt = Math.max(0, Math.min(now - last, 50)) / 1000;
      last = now;
      const time = Math.max(0, now - started) / 1000;
      const element = canvas.current;
      const c = element?.getContext("2d") as Ctx | null | undefined;
      if (!element || !c) return;

      let secret = false;
      if (running && !input.done) {
        const out: Out = {
          sound(name) {
            const bleep = sounds();
            if (name === "clear") bleep.clear(1);
            else if (name === "clear2") bleep.clear(2);
            else bleep[name]();
          },
          say: onStatus,
          secret: () => {
            secret = true;
          },
        };
        const step: Input = {
          held: input.held,
          pressed: input.pressed,
          taps: input.taps,
          touches: [...input.pointers.values()].map((pointer) => pointer.now),
          swipes: input.swipes,
        };
        input.pressed = [];
        input.taps = [];
        input.swipes = [];
        def.step(input.state, dt, step, out);
      }
      def.draw(c, input.state, time, still);
      const status = def.status(input.state);

      // Para las pruebas automáticas: el estado de la partida, a la vista en la página.
      element.dataset.score = String(status.score);
      element.dataset.lives = String(status.lives);
      element.dataset.level = String(status.level);
      element.dataset.letters = String(status.letters);
      element.dataset.world = String(status.world);
      if (status.world !== input.world) {
        input.world = status.world;
        onWorld(status.world);
      }
      if (status.over && !input.done) {
        input.done = true;
        element.dataset.over = "true";
        onOver(status);
      } else if (secret) onSecret();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Dónde cae un toque, en píxeles del lienzo. */
  const pointOf = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH * scale - 1, ((event.clientX - box.left) / box.width) * WIDTH * scale)),
      y: Math.max(0, Math.min(HEIGHT * scale - 1, ((event.clientY - box.top) / box.height) * HEIGHT * scale)),
    };
  };

  const down = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!latest.current.running) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = pointOf(event);
    live.current.pointers.set(event.pointerId, { now: point, from: point, at: performance.now() });
    live.current.taps.push(point);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = live.current.pointers.get(event.pointerId);
    if (pointer) pointer.now = pointOf(event);
  };
  const up = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const input = live.current;
    const pointer = input.pointers.get(event.pointerId);
    if (!pointer) return;
    input.pointers.delete(event.pointerId);
    // Un deslizamiento: el dedo se movió bastante en una dirección.
    const dx = pointer.now.x - pointer.from.x;
    const dy = pointer.now.y - pointer.from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 10) input.swipes.push(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  return (
    <canvas
      ref={canvas}
      className="bn-mini"
      width={WIDTH * scale}
      height={HEIGHT * scale}
      aria-hidden="true"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
});
