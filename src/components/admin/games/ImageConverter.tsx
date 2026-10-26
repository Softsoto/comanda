"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_COLORS, type SpriteArt } from "@/lib/game-theme";
import { convertImage, cornerColor, distinctColors, hasTransparency, isBlankArt, isReadyArt, type ConvertOptions, type RGBAImage } from "@/lib/sprite-convert";
import { SpriteView } from "./SpriteView";

/** Formatos de imagen que se pueden subir. */
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/** La imagen se achica a este lado antes de convertirla (más no se nota en un dibujo de 16 píxeles). */
const WORK_SIDE = 512;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** Un problema con la imagen, explicado para quien la subió. */
class ImageProblem extends Error {}

/** Lee una imagen subida y devuelve sus píxeles (achicada si es muy grande) y una dirección para mostrarla. */
export async function readImage(file: File): Promise<{ image: RGBAImage; url: string }> {
  if (!IMAGE_TYPES.includes(file.type)) throw new ImageProblem("Ese archivo no es una imagen PNG, JPG, GIF o WEBP.");
  if (file.size > MAX_FILE_BYTES) throw new ImageProblem("La imagen pesa demasiado (más de 15 MB). Prueba con una más liviana.");
  const url = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.decoding = "async";
    picture.src = url;
    await picture.decode();
    const scale = Math.min(1, WORK_SIDE / Math.max(picture.naturalWidth, picture.naturalHeight));
    const width = Math.max(1, Math.round(picture.naturalWidth * scale));
    const height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    if (!c) throw new ImageProblem("Este navegador no pudo leer la imagen.");
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    c.drawImage(picture, 0, 0, width, height);
    const { data } = c.getImageData(0, 0, width, height);
    return { image: { width, height, data }, url };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof ImageProblem ? error : new ImageProblem("No se pudo abrir la imagen. Puede estar dañada: prueba con otra.");
  }
}

/**
 * La ventana del convertidor: ajusta la imagen subida a la medida del
 * personaje, quita el fondo y reduce los colores, con vista previa en vivo.
 */
export function ImageConverter({
  title,
  width,
  height,
  image,
  url,
  onAccept,
  onCancel,
}: {
  title: string;
  width: number;
  height: number;
  image: RGBAImage;
  url: string;
  onAccept: (art: SpriteArt) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const transparent = useMemo(() => hasTransparency(image), [image]);
  const background = useMemo(() => cornerColor(image), [image]);
  const [options, setOptions] = useState<ConvertOptions>(() => ({
    width,
    height,
    fit: "contain",
    focusX: 0.5,
    focusY: 0.5,
    background: transparent ? "image" : "corners",
    tolerance: 12,
    // Un dibujo de píxeles que ya mide justo lo del espacio conserva todos sus colores.
    colors: isReadyArt(image, width, height) ? Math.max(2, distinctColors(image).length) : 8,
    outline: false,
    trim: true,
  }));
  const art = useMemo(() => convertImage(image, options), [image, options]);
  const blank = isBlankArt(art);
  const used = Object.keys(art.colors).length;
  const set = (change: Partial<ConvertOptions>) => setOptions((current) => ({ ...current, ...change }));
  const big = Math.max(4, Math.floor(240 / Math.max(width, height)));

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="tool-dialog" aria-labelledby="convertir-titulo" onClose={onCancel}>
      <header className="flex items-center gap-3 border-b border-line/25 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 id="convertir-titulo" className="font-display text-title font-bold">
            {title}
          </h2>
          <p className="text-caption text-muted">
            Se convierte a {width} × {height} píxeles. Mueve las opciones y mira el resultado.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dialog.current?.close()}>
          Cerrar
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <fieldset>
              <legend className="label">Ajuste a la medida</legend>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="convertir-ajuste" className="mt-0.5 size-5 accent-[var(--brand)]" checked={options.fit === "contain"} onChange={() => set({ fit: "contain" })} />
                  <span>
                    <span className="font-semibold">Encajar entera</span>
                    <span className="block text-muted">Se ve toda la imagen; lo que sobre queda transparente.</span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="convertir-ajuste" className="mt-0.5 size-5 accent-[var(--brand)]" checked={options.fit === "cover"} onChange={() => set({ fit: "cover" })} />
                  <span>
                    <span className="font-semibold">Llenar recortando</span>
                    <span className="block text-muted">Llena todo el espacio y recorta los bordes que no caben.</span>
                  </span>
                </label>
              </div>
              <label className="mt-1 flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                <input type="checkbox" className="mt-0.5 size-5 accent-[var(--brand)]" checked={options.trim !== false} onChange={(event) => set({ trim: event.target.checked })} />
                <span>
                  <span className="font-semibold">Quitar los bordes vacíos</span>
                  <span className="block text-muted">Recorta lo transparente de alrededor para que la figura use todo el espacio.</span>
                </span>
              </label>
              {options.fit === "cover" && (
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="convertir-x">
                      Recorte de lado: {Math.round((options.focusX ?? 0.5) * 100)} %
                    </label>
                    <input id="convertir-x" type="range" min={0} max={100} className="w-full accent-[var(--brand)]" value={Math.round((options.focusX ?? 0.5) * 100)} onChange={(event) => set({ focusX: Number(event.target.value) / 100 })} aria-describedby="convertir-x-ayuda" />
                    <p id="convertir-x-ayuda" className="hint">0 % guarda la izquierda, 100 % la derecha.</p>
                  </div>
                  <div>
                    <label className="label" htmlFor="convertir-y">
                      Recorte de alto: {Math.round((options.focusY ?? 0.5) * 100)} %
                    </label>
                    <input id="convertir-y" type="range" min={0} max={100} className="w-full accent-[var(--brand)]" value={Math.round((options.focusY ?? 0.5) * 100)} onChange={(event) => set({ focusY: Number(event.target.value) / 100 })} aria-describedby="convertir-y-ayuda" />
                    <p id="convertir-y-ayuda" className="hint">0 % guarda lo de arriba, 100 % lo de abajo.</p>
                  </div>
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className="label">Fondo</legend>
              <div className="flex flex-col gap-1">
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="convertir-fondo" className="mt-0.5 size-5 accent-[var(--brand)]" checked={options.background === "image"} onChange={() => set({ background: "image" })} />
                  <span>
                    <span className="font-semibold">Usar la transparencia de la imagen</span>
                    <span className="block text-muted">{transparent ? "Esta imagen ya trae partes transparentes." : "Esta imagen no trae transparencia: se verá su fondo."}</span>
                  </span>
                </label>
                <label className="flex min-h-11 cursor-pointer items-start gap-2 py-1 text-sm">
                  <input type="radio" name="convertir-fondo" className="mt-0.5 size-5 accent-[var(--brand)]" checked={options.background === "corners"} onChange={() => set({ background: "corners" })} />
                  <span>
                    <span className="font-semibold">Quitar el color del fondo</span>
                    <span className="flex items-center gap-1.5 text-muted">
                      Se toma de las esquinas:
                      <span className="inline-block size-4 rounded-[3px] border border-line" style={{ background }} aria-hidden="true" />
                      {background}
                    </span>
                  </span>
                </label>
              </div>
              {options.background === "corners" && (
                <div className="mt-2">
                  <label className="label" htmlFor="convertir-tolerancia">
                    Tolerancia: {options.tolerance}
                  </label>
                  <input id="convertir-tolerancia" type="range" min={0} max={60} className="w-full accent-[var(--brand)]" value={options.tolerance} onChange={(event) => set({ tolerance: Number(event.target.value) })} aria-describedby="convertir-tolerancia-ayuda" />
                  <p id="convertir-tolerancia-ayuda" className="hint">
                    Más alto quita también los colores parecidos al del fondo. Solo se quita lo que toca el borde, así que lo del mismo color dentro del dibujo se queda.
                  </p>
                </div>
              )}
            </fieldset>

            <div>
              <label className="label" htmlFor="convertir-colores">
                Cantidad de colores: {options.colors}
              </label>
              <input id="convertir-colores" type="range" min={2} max={MAX_COLORS} className="w-full accent-[var(--brand)]" value={options.colors} onChange={(event) => set({ colors: Number(event.target.value) })} aria-describedby="convertir-colores-ayuda" />
              <p id="convertir-colores-ayuda" className="hint">
                Pocos colores se ven más “de videojuego”. Entre 4 y 8 suele quedar bien.
              </p>
            </div>

            <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-[var(--brand)]" checked={!!options.outline} onChange={(event) => set({ outline: event.target.checked })} />
              <span>
                <span className="font-semibold">Contorno oscuro</span>
                <span className="block text-muted">Una línea alrededor de la figura, como los personajes originales. Ayuda a que se vea sobre el paisaje.</span>
              </span>
            </label>
          </div>

          {/* En el celular, el resultado va primero: así se ve el efecto de cada opción sin bajar tanto. */}
          <div className="order-first flex flex-col gap-4 md:order-none">
            <figure>
              <figcaption className="label">Tu imagen</figcaption>
              <img src={url} alt="La imagen que subiste" className="checker pixelated h-32 w-auto max-w-full rounded-field object-contain" />
            </figure>
            <figure>
              <figcaption className="label">Resultado</figcaption>
              <div className="flex flex-wrap items-end gap-4">
                <SpriteView art={art} scale={big} label={`Vista previa agrandada del resultado, ${width} por ${height} píxeles`} className="rounded-[4px]" />
                <div className="flex flex-col items-center gap-1 rounded-field bg-[#0b0a24] p-3">
                  <SpriteView art={art} scale={1} backdrop="none" />
                  <SpriteView art={art} scale={2} backdrop="none" />
                  <span className="text-caption text-[#c9c4e8]">Tamaño real</span>
                </div>
              </div>
              <p className="hint" role="status">
                {blank
                  ? "No quedó nada: baja la tolerancia o elige “Usar la transparencia de la imagen”."
                  : `Usa ${used} ${used === 1 ? "color" : "colores"}. Después puedes retocarlo píxel por píxel.`}
              </p>
            </figure>
          </div>
        </div>
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-line/25 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={blank}
          onClick={() => {
            onAccept(art);
          }}
        >
          Seguir al editor
        </button>
      </footer>
    </dialog>
  );
}
