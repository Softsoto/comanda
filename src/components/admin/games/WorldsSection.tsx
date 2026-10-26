"use client";

import { useEffect, useRef, useState } from "react";
import type { Ctx } from "@/components/secret/art";
import type { Scene } from "@/components/secret/worlds";
import { WORLD_COUNT, WORLD_NAMES } from "@/lib/world-list";

/** Medida de la vista previa, en píxeles del juego (el navegador la agranda sin suavizar). */
const PREVIEW_W = 160;
const PREVIEW_H = 96;
/** Cuadros por segundo de las vistas previas: basta para ver que se mueven, sin gastar batería. */
const FRAME_MS = 1000 / 12;

const ALL = Array.from({ length: WORLD_COUNT }, (_, index) => index);

/** "EL BOSQUE DE BAMBÚ" → "El bosque de bambú". */
const nice = (name: string) => name.charAt(0) + name.slice(1).toLowerCase();
export const worldLabel = (world: number) => nice(WORLD_NAMES[world] ?? `Paisaje ${world + 1}`);

/**
 * El orden que se ve en el panel: los encendidos en el orden de `worlds` y los
 * apagados en el lugar donde estaban (`order` es el orden completo de esta visita).
 */
function arrange(order: number[], worlds: number[]): number[] {
  const on = new Set(worlds);
  const known = [...order.filter((world) => ALL.includes(world)), ...ALL.filter((world) => !order.includes(world))];
  const queue = [...worlds];
  return known.map((world) => (on.has(world) ? (queue.shift() as number) : world));
}

/** Pinta un paisaje en un <canvas> pequeño. createScene usa `document`: solo se arma en el navegador. */
function ScenePreview({ world, playing, label }: { world: number; playing: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext("2d") as Ctx | null;
    if (!canvas || !c) return;
    let scene: Scene | null = null;
    let frame = 0;
    let visible = true;
    let last = -1e9;
    let cancelled = false;
    const started = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (!scene || !visible || now - last < FRAME_MS) return;
      last = now;
      // La hora del cuadro puede ser un poco anterior a `started`: los paisajes no saben pintar tiempos negativos.
      scene.paint(c, Math.max(0, now - started));
    };

    // Las piezas de los paisajes se cargan aparte, la primera vez que se necesitan.
    void import("@/components/secret/worlds").then(({ createScene }) => {
      if (cancelled) return;
      scene = createScene(world, PREVIEW_W, PREVIEW_H);
      // Quieto: un instante fijo, siempre el mismo.
      scene.paint(c, 4000, !playing);
      if (playing) frame = requestAnimationFrame(tick);
    });

    // Fuera de la pantalla no se pinta.
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    watcher.observe(canvas);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      watcher.disconnect();
    };
  }, [world, playing]);

  return (
    <canvas
      ref={ref}
      width={PREVIEW_W}
      height={PREVIEW_H}
      className="pixelated block aspect-[5/3] w-full bg-[#0b0a24]"
      role="img"
      aria-label={label}
    />
  );
}

/**
 * Los paisajes: cuáles salen en los juegos y en qué orden. Siempre queda al
 * menos uno encendido.
 */
export function WorldsSection({ worlds, onChange }: { worlds: number[]; onChange: (worlds: number[]) => void }) {
  // Al abrir el panel, los encendidos en su orden y los apagados al final.
  const [order, setOrder] = useState<number[]>(() => [...worlds, ...ALL.filter((world) => !worlds.includes(world))]);
  const [playing, setPlaying] = useState(true);
  const list = arrange(order, worlds);
  const on = new Set(worlds);

  // Con "reducir movimiento" en el sistema, las vistas empiezan quietas.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);

  const focusLater = (target: string) => requestAnimationFrame(() => document.getElementById(target)?.focus());

  const move = (from: number, to: number) => {
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
    onChange(next.filter((world) => on.has(world)));
    // El foco sigue al paisaje movido; si quedó en un extremo, al otro botón.
    const button = from > to ? (to === 0 ? "bajar" : "subir") : to === list.length - 1 ? "subir" : "bajar";
    focusLater(`paisaje-${item}-${button}`);
  };

  const toggle = (world: number) => {
    setOrder(list);
    onChange(list.filter((item) => (item === world ? !on.has(world) : on.has(item))));
  };

  return (
    <section className="card" aria-labelledby="juegos-paisajes">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 id="juegos-paisajes" className="font-display text-title font-bold">
          Paisajes
        </h2>
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={!playing} onClick={() => setPlaying((value) => !value)}>
          {playing ? "Pausar las vistas" : "Mover las vistas"}
        </button>
      </div>
      <p className="mt-1 mb-4 text-sm text-muted">
        Son los fondos de los juegos. La portada cambia de paisaje cada 9 segundos y, al jugar, se pasa al siguiente a medida que avanzas: siempre los encendidos, en
        este orden, y al terminar vuelven a empezar. Apaga los que no quieras que salgan.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {list.map((world, index) => {
          const shown = on.has(world);
          const only = shown && worlds.length === 1;
          const name = worldLabel(world);
          const place = shown ? worlds.indexOf(world) + 1 : 0;
          return (
            <li key={world} className={`flex flex-col gap-3 rounded-field border p-3 ${shown ? "border-line/40" : "border-dashed border-line/60"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 id={`paisaje-${world}-nombre`} className="font-semibold">
                  {name}
                </h3>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold ${shown ? "bg-brand-tint text-ink" : "border border-line text-muted"}`}>
                  {shown ? `Sale ${place}.º` : "No sale"}
                </span>
              </div>
              <div className={`overflow-hidden rounded-field border border-line/40 transition-opacity ${shown ? "" : "opacity-45 grayscale"}`}>
                <ScenePreview world={world} playing={playing && shown} label={`Vista previa: ${name.toLowerCase()}${shown ? "" : " (apagado)"}`} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  role="switch"
                  id={`paisaje-${world}-sale`}
                  aria-checked={shown}
                  aria-labelledby={`paisaje-${world}-nombre paisaje-${world}-sale-texto`}
                  aria-describedby={only ? `paisaje-${world}-unico` : undefined}
                  disabled={only}
                  className="group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full pr-2 disabled:cursor-not-allowed"
                  onClick={() => toggle(world)}
                >
                  <span
                    aria-hidden="true"
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors ${shown ? "border-brand bg-brand" : "border-line bg-raised"} group-disabled:opacity-60`}
                  >
                    <span className={`absolute size-5 rounded-full shadow-sm transition-[left] ${shown ? "left-[calc(100%-1.375rem)] bg-on-brand" : "left-0.5 bg-line"}`} />
                  </span>
                  <span id={`paisaje-${world}-sale-texto`} className="text-sm font-semibold">
                    Sale en los juegos
                  </span>
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    id={`paisaje-${world}-subir`}
                    className="btn btn-ghost btn-sm px-3"
                    disabled={index === 0}
                    aria-label={`Subir ${name.toLowerCase()}`}
                    onClick={() => move(index, index - 1)}
                  >
                    <span aria-hidden="true">↑</span> Subir
                  </button>
                  <button
                    type="button"
                    id={`paisaje-${world}-bajar`}
                    className="btn btn-ghost btn-sm px-3"
                    disabled={index === list.length - 1}
                    aria-label={`Bajar ${name.toLowerCase()}`}
                    onClick={() => move(index, index + 1)}
                  >
                    <span aria-hidden="true">↓</span> Bajar
                  </button>
                </div>
              </div>
              {only && (
                <p id={`paisaje-${world}-unico`} className="-mt-1 text-caption text-muted">
                  Es el único encendido. Siempre tiene que quedar uno, porque los juegos necesitan un paisaje de fondo. Para apagarlo, enciende otro primero.
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <p className="hint" role="status">
        {worlds.length === 1 ? "Sale 1 paisaje" : `Salen ${worlds.length} paisajes`} de {WORLD_COUNT}: {worlds.map(worldLabel).join(", ")}.
      </p>
    </section>
  );
}
