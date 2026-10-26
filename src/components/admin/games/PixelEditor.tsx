"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { MAX_COLORS, type SpriteArt } from "@/lib/game-theme";
import { blankGrid, floodFill, freeChar, isBlank, lineCells, mirror, setPixel, shift, toArt, toEditable, type Grid, type PaletteEntry } from "@/lib/sprite-edit";
import { SpriteView } from "./SpriteView";

type Tool = "lapiz" | "borrador" | "balde" | "gotero";
type Doc = { grid: Grid; palette: PaletteEntry[] };

const TOOLS: { id: Tool; label: string; help: string }[] = [
  { id: "lapiz", label: "Lápiz", help: "pinta con el color elegido" },
  { id: "borrador", label: "Borrador", help: "deja transparente" },
  { id: "balde", label: "Balde", help: "rellena una zona del mismo color" },
  { id: "gotero", label: "Gotero", help: "toma el color de un píxel" },
];
const HISTORY = 100;

/**
 * El editor de píxeles: una rejilla agrandada para pintar con el dedo, el
 * ratón o el teclado (las flechas mueven el cursor y Espacio pinta).
 * Va dentro de una ventana (<dialog>) que se abre al montarlo.
 */
export function PixelEditor({
  title,
  width,
  height,
  initial,
  onAccept,
  onCancel,
}: {
  title: string;
  width: number;
  height: number;
  initial: SpriteArt;
  onAccept: (art: SpriteArt) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Doc>(() => toEditable(initial, width, height));
  const [color, setColor] = useState(() => doc.palette[doc.palette.length > 1 ? 1 : 0].char);
  const [tool, setTool] = useState<Tool>("lapiz");
  const [showGrid, setShowGrid] = useState(true);
  const [cursor, setCursor] = useState({ x: Math.floor(width / 2), y: Math.floor(height / 2), visible: false });
  const [cell, setCell] = useState(24);
  const [error, setError] = useState("");
  const [say, setSay] = useState("");
  const history = useRef<{ past: Doc[]; future: Doc[] }>({ past: [], future: [] });
  const [, setVersion] = useState(0);
  const stroke = useRef<{ before: Doc; last: [number, number] } | null>(null);
  const colorEdit = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // El tamaño de cada cuadro: lo más grande que quepa en el ancho disponible.
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const fit = () => {
      const available = Math.min(element.clientWidth, 520);
      // En el computador la ventana no se desplaza: la rejilla cabe en el alto que queda.
      const tall = Math.floor((window.innerHeight - 340) / height);
      setCell(Math.max(10, Math.min(40, Math.floor(available / width), Math.max(14, tall))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);

  // El dibujo más reciente, para los eventos seguidos del dedo (antes de que React vuelva a pintar).
  const latest = useRef(doc);
  const put = (next: Doc) => {
    latest.current = next;
    setDoc(next);
  };
  const remember = (before: Doc) => {
    history.current.past = [...history.current.past.slice(-HISTORY + 1), before];
    history.current.future = [];
    setVersion((v) => v + 1);
  };

  /** Un cambio que se puede deshacer de una vez. */
  const commit = (next: Doc) => {
    const now = latest.current;
    if (now.grid.join("|") === next.grid.join("|") && now.palette === next.palette) return;
    remember(now);
    put(next);
    setError("");
  };

  const undo = () => {
    const before = history.current.past.at(-1);
    if (!before) return;
    history.current.past = history.current.past.slice(0, -1);
    history.current.future = [...history.current.future, latest.current];
    put(before);
    setVersion((v) => v + 1);
    setSay("Deshecho.");
  };
  const redo = () => {
    const after = history.current.future.at(-1);
    if (!after) return;
    history.current.future = history.current.future.slice(0, -1);
    history.current.past = [...history.current.past, latest.current];
    put(after);
    setVersion((v) => v + 1);
    setSay("Rehecho.");
  };

  // Dibuja la rejilla: cuadritos para lo transparente, los píxeles, las líneas y el cursor del teclado.
  useEffect(() => {
    const element = canvas.current;
    const c = element?.getContext("2d");
    if (!element || !c) return;
    const ratio = window.devicePixelRatio || 1;
    element.width = width * cell * ratio;
    element.height = height * cell * ratio;
    c.setTransform(ratio, 0, 0, ratio, 0, 0);
    const style = getComputedStyle(document.documentElement);
    const checkerA = style.getPropertyValue("--checker-a").trim() || "#ffffff";
    const checkerB = style.getPropertyValue("--checker-b").trim() || "#e6e0d6";
    const colors = Object.fromEntries(doc.palette.map((entry) => [entry.char, entry.hex]));
    const half = cell / 2;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const char = doc.grid[y][x];
        if (colors[char]) {
          c.fillStyle = colors[char];
          c.fillRect(x * cell, y * cell, cell, cell);
        } else {
          for (let q = 0; q < 4; q++) {
            c.fillStyle = (q === 0 || q === 3) !== ((x + y) % 2 === 0) ? checkerA : checkerB;
            c.fillRect(x * cell + (q % 2) * half, y * cell + (q >> 1) * half, half, half);
          }
        }
      }
    if (showGrid) {
      c.strokeStyle = "rgba(128, 120, 110, 0.45)";
      c.lineWidth = 1 / ratio;
      c.beginPath();
      for (let x = 1; x < width; x++) {
        c.moveTo(x * cell, 0);
        c.lineTo(x * cell, height * cell);
      }
      for (let y = 1; y < height; y++) {
        c.moveTo(0, y * cell);
        c.lineTo(width * cell, y * cell);
      }
      c.stroke();
    }
    if (cursor.visible) {
      c.lineWidth = 2;
      c.strokeStyle = "#ffffff";
      c.strokeRect(cursor.x * cell + 1, cursor.y * cell + 1, cell - 2, cell - 2);
      c.strokeStyle = "#000000";
      c.strokeRect(cursor.x * cell + 3, cursor.y * cell + 3, cell - 6, cell - 6);
    }
  }, [doc, cell, width, height, showGrid, cursor]);

  const current = doc.palette.find((entry) => entry.char === color) ?? doc.palette[0];

  /** Aplica la herramienta en un píxel. `grid` es el dibujo en el que se está pintando. */
  const apply = (grid: Grid, x: number, y: number): Grid => {
    if (tool === "lapiz") return setPixel(grid, x, y, current.char);
    if (tool === "borrador") return setPixel(grid, x, y, ".");
    if (tool === "balde") return floodFill(grid, x, y, current.char);
    return grid;
  };

  const pick = (x: number, y: number) => {
    const char = doc.grid[y][x];
    if (char === ".") {
      setTool("borrador");
      setSay("Ese píxel es transparente: queda elegido el borrador.");
      return;
    }
    setColor(char);
    setTool("lapiz");
    setSay(`Color tomado: ${doc.palette.find((entry) => entry.char === char)?.hex ?? ""}. Queda elegido el lápiz.`);
  };

  const cellAt = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * height);
    return [Math.min(width - 1, Math.max(0, x)), Math.min(height - 1, Math.max(0, y))];
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    const [x, y] = cellAt(event);
    setCursor({ x, y, visible: false });
    if (tool === "gotero") return pick(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);
    const before = latest.current;
    stroke.current = { before, last: [x, y] };
    put({ ...before, grid: apply(before.grid, x, y) });
    setError("");
  };
  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const active = stroke.current;
    if (!active || tool === "balde") return;
    const [x, y] = cellAt(event);
    const [lx, ly] = active.last;
    if (x === lx && y === ly) return;
    active.last = [x, y];
    const now = latest.current;
    put({ ...now, grid: lineCells(lx, ly, x, y).reduce((grid, [cx, cy]) => apply(grid, cx, cy), now.grid) });
  };
  const endStroke = () => {
    const active = stroke.current;
    stroke.current = null;
    if (!active) return;
    if (latest.current.grid.join("|") !== active.before.grid.join("|")) remember(active.before);
  };

  const onCanvasKey = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = moves[event.key];
    if (step) {
      event.preventDefault();
      const x = Math.min(width - 1, Math.max(0, cursor.x + step[0]));
      const y = Math.min(height - 1, Math.max(0, cursor.y + step[1]));
      setCursor({ x, y, visible: true });
      const char = doc.grid[y][x];
      setSay(`Columna ${x + 1}, fila ${y + 1}: ${char === "." ? "transparente" : `color ${doc.palette.findIndex((entry) => entry.char === char) + 1}`}.`);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setCursor((c) => ({ ...c, visible: true }));
      if (tool === "gotero") return pick(cursor.x, cursor.y);
      commit({ ...doc, grid: apply(doc.grid, cursor.x, cursor.y) });
      setSay(tool === "borrador" ? "Borrado." : tool === "balde" ? "Zona rellenada." : "Pintado.");
    }
  };

  const onDialogKey = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  };

  const changeHex = (hex: string) => {
    const now = latest.current;
    if (!colorEdit.current) {
      remember(now);
      colorEdit.current = true;
    }
    put({ ...now, palette: now.palette.map((entry) => (entry.char === current.char ? { ...entry, hex } : entry)) });
  };
  const addColor = () => {
    const char = freeChar(doc.palette);
    if (!char) return;
    commit({ ...doc, palette: [...doc.palette, { char, hex: current.hex }] });
    setColor(char);
    setTool("lapiz");
    setSay(`Color ${doc.palette.length + 1} agregado: cámbialo con “Cambiar este color”.`);
    requestAnimationFrame(() => document.getElementById("editor-cambiar-color")?.focus());
  };

  const accept = () => {
    if (isBlank(doc.grid)) {
      setError("El dibujo está vacío. Pinta al menos un píxel antes de usarlo.");
      return;
    }
    onAccept(toArt(doc.grid, doc.palette));
    dialog.current?.close();
  };

  const art = toArt(doc.grid, doc.palette);
  const { past, future } = history.current;

  return (
    <dialog
      ref={dialog}
      className="tool-dialog"
      aria-labelledby="editor-titulo"
      onKeyDown={onDialogKey}
      onClose={onCancel}
    >
      <header className="flex items-center gap-3 border-b border-line/25 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="editor-titulo" className="font-display text-title font-bold">
            {title}
          </h2>
          <p className="text-caption text-muted">
            {width} × {height} píxeles
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()}>
          Cerrar sin usar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div role="group" aria-label="Herramienta" className="flex flex-wrap gap-1.5">
              {TOOLS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`btn btn-sm ${tool === item.id ? "btn-primary" : "btn-secondary"}`}
                  aria-pressed={tool === item.id}
                  title={item.help}
                  onClick={() => setTool(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div ref={box} className="w-full">
              <canvas
                ref={canvas}
                className="block touch-none rounded-[4px] outline-offset-4"
                style={{ width: width * cell, height: height * cell, cursor: "crosshair" }}
                tabIndex={0}
                role="application"
                aria-label={`Lienzo de ${width} por ${height} píxeles`}
                aria-describedby="editor-teclado"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onLostPointerCapture={endStroke}
                onKeyDown={onCanvasKey}
                onFocus={() => setCursor((c) => ({ ...c, visible: true }))}
                onBlur={() => setCursor((c) => ({ ...c, visible: false }))}
                onContextMenu={(event) => event.preventDefault()}
              />
              <p id="editor-teclado" className="hint">
                Con el teclado: las flechas mueven el cuadro blanco y Espacio usa la herramienta. Ctrl+Z deshace y Ctrl+Y rehace.
              </p>
              <p role="status" className="sr-only">
                {say}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="btn btn-secondary btn-sm" disabled={past.length === 0} onClick={undo}>
                Deshacer
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={future.length === 0} onClick={redo}>
                Rehacer
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => commit({ ...doc, grid: mirror(doc.grid) })}>
                Espejo
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={isBlank(doc.grid)}
                onClick={() => {
                  commit({ ...doc, grid: blankGrid(width, height) });
                  setSay("Dibujo borrado. Puedes deshacerlo.");
                }}
              >
                Borrar todo
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div role="group" aria-label="Mover el dibujo un píxel" className="flex items-center gap-1">
                <span className="mr-1 text-sm font-semibold" aria-hidden="true">
                  Mover:
                </span>
                {(
                  [
                    ["←", "Mover a la izquierda", -1, 0],
                    ["↑", "Mover hacia arriba", 0, -1],
                    ["↓", "Mover hacia abajo", 0, 1],
                    ["→", "Mover a la derecha", 1, 0],
                  ] as const
                ).map(([arrow, label, dx, dy]) => (
                  <button key={label} type="button" className="btn btn-secondary btn-sm w-11 px-0" aria-label={label} title={label} onClick={() => commit({ ...doc, grid: shift(doc.grid, dx, dy) })}>
                    <span aria-hidden="true">{arrow}</span>
                  </button>
                ))}
              </div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" className="size-5 accent-[var(--brand)]" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                Cuadrícula
              </label>
            </div>

            <fieldset>
              <legend className="label">Colores ({doc.palette.length} de {MAX_COLORS})</legend>
              <div className="flex flex-wrap gap-1.5">
                {doc.palette.map((entry, index) => (
                  <button
                    key={entry.char}
                    type="button"
                    className={`size-11 rounded-field border ${entry.char === current.char ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-surface" : "border-line"}`}
                    style={{ background: entry.hex }}
                    aria-pressed={entry.char === current.char}
                    aria-label={`Color ${index + 1} (${entry.hex})`}
                    onClick={() => {
                      setColor(entry.char);
                      if (tool === "borrador" || tool === "gotero") setTool("lapiz");
                    }}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label htmlFor="editor-cambiar-color" className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold">
                  <input
                    id="editor-cambiar-color"
                    type="color"
                    className="h-11 w-14 cursor-pointer rounded-field border border-line bg-raised p-1"
                    value={current.hex}
                    onFocus={() => (colorEdit.current = false)}
                    onBlur={() => (colorEdit.current = false)}
                    onChange={(event) => changeHex(event.target.value)}
                  />
                  Cambiar este color
                </label>
                <button type="button" className="btn btn-secondary btn-sm" disabled={doc.palette.length >= MAX_COLORS} onClick={addColor}>
                  <span aria-hidden="true">+</span> Agregar color
                </button>
              </div>
              <p className="hint">Al cambiar un color, cambian todos los píxeles que lo usan.</p>
            </fieldset>

            <figure>
              <figcaption className="label">Tamaño real</figcaption>
              <div className="flex flex-wrap items-end gap-3 rounded-field bg-[#0b0a24] p-3">
                {[1, 2, 4].map((scale) => (
                  <div key={scale} className="flex flex-col items-center gap-1">
                    <SpriteView art={art} scale={scale} backdrop="none" />
                    <span className="text-caption text-[#c9c4e8]">×{scale}</span>
                  </div>
                ))}
              </div>
            </figure>
          </div>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t border-line/25 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="rounded-field border border-danger px-3 py-2 text-sm font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={accept}>
            Usar este dibujo
          </button>
        </div>
      </footer>
    </dialog>
  );
}
