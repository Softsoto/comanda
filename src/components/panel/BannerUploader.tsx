"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addBannerAction } from "@/lib/actions/store";
import { BANNER_TITLE_MAX, getBannerSlot, type BannerSlot } from "@/lib/banners";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { FormMessage } from "../ui/FormMessage";

type Picked = { url: string; image: HTMLImageElement };

function loadImage(file: File): Promise<Picked> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ url, image });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no se pudo leer"));
    };
    image.src = url;
  });
}

/**
 * Recorta la imagen a la forma del espacio (rellenándolo por completo) y la
 * reduce antes de subirla. `focus` (0 a 1) decide qué parte se conserva
 * cuando la imagen no tiene la misma forma: 0 = inicio, 0.5 = centro, 1 = final.
 */
function cropImage(image: HTMLImageElement, width: number, height: number, focus: number): Promise<Blob> {
  const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  // Una imagen pequeña no se agranda: se sube con el tamaño que tiene.
  const outWidth = Math.min(width, Math.max(320, Math.round(width / cover)));
  const outHeight = Math.round((outWidth * height) / width);
  const scale = (cover * outWidth) / width;
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("sin canvas"));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outWidth, outHeight);
  context.imageSmoothingQuality = "high";
  context.drawImage(image, -(drawWidth - outWidth) * focus, -(drawHeight - outHeight) * focus, drawWidth, drawHeight);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("sin imagen"))), "image/jpeg", 0.86);
  });
}

/** Formulario para añadir una imagen a un espacio de publicidad, con vista previa del recorte. */
export function BannerUploader({ slot: slotValue, disabled }: { slot: BannerSlot; disabled: boolean }) {
  const slot = getBannerSlot(slotValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [focus, setFocus] = useState(50);
  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked.url);
    };
  }, [picked]);

  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    formData.delete("image");
    if (!picked) return { message: "Elige una imagen para subir." };
    let blob: Blob;
    try {
      blob = await cropImage(picked.image, slot.width, slot.height, focus / 100);
    } catch {
      return { message: "No pudimos preparar esa imagen. Prueba con otra." };
    }
    if (blob.size > LIMITS.maxImageBytes) return { message: "La imagen pesa demasiado. Prueba con otra." };
    formData.set("image", blob, "anuncio.jpg");
    const result = await addBannerAction(previous, formData);
    if (result.ok) {
      setPicked(null);
      setTitle("");
      setFocus(50);
    }
    return result;
  }, EMPTY_FORM);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProblem("");
    try {
      setPicked(await loadImage(file));
      setFocus(50);
    } catch {
      setPicked(null);
      setProblem("No pudimos leer esa imagen. Prueba con una foto JPG o PNG.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // ¿Sobra imagen a lo ancho o a lo alto? De eso depende hacia dónde se puede mover el encuadre.
  const shape = picked ? picked.image.naturalWidth / picked.image.naturalHeight : 0;
  const target = slot.width / slot.height;
  const overflow = !picked || Math.abs(shape - target) / target < 0.02 ? null : shape > target ? "x" : "y";
  const fileId = `anuncio-${slot.value}`;

  if (disabled) {
    return (
      <p className="text-sm text-muted">
        Llegaste al máximo de {slot.max} imágenes en este espacio. Quita una para subir otra.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="slot" value={slot.value} />
      <FormMessage state={problem ? { message: problem } : state} />

      {picked && (
        <div className="flex flex-col gap-3">
          <div>
            <p className="label">Así se verá</p>
            <div
              className="overflow-hidden rounded-card border border-line/40 bg-surface"
              style={{ aspectRatio: `${slot.width} / ${slot.height}` }}
            >
              <img
                src={picked.url}
                alt="Vista previa del anuncio"
                className="h-full w-full object-cover"
                style={{ objectPosition: overflow === "x" ? `${focus}% 50%` : `50% ${focus}%` }}
              />
            </div>
          </div>

          {overflow && (
            <div>
              <label className="label" htmlFor={`${fileId}-encuadre`}>
                Encuadre: mueve la imagen {overflow === "x" ? "a la izquierda o a la derecha" : "hacia arriba o hacia abajo"}
              </label>
              <input
                id={`${fileId}-encuadre`}
                type="range"
                min={0}
                max={100}
                value={focus}
                onChange={(event) => setFocus(Number(event.target.value))}
                className="h-11 w-full accent-[var(--brand)]"
              />
              <p className="hint mt-0">
                La imagen no tiene la forma de este espacio, así que se recorta. Elige la parte que quieres mostrar.
              </p>
            </div>
          )}

          <div>
            <label className="label" htmlFor={`${fileId}-texto`}>
              ¿Qué dice la imagen? <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id={`${fileId}-texto`}
              name="title"
              className="field"
              maxLength={BANNER_TITLE_MAX}
              placeholder="2x1 en hamburguesas todos los martes"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <p className="hint">Lo leen en voz alta los celulares de las personas que no pueden ver la imagen.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label
          className={`btn ${picked ? "btn-secondary" : "btn-outline-brand"} has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand`}
          aria-disabled={pending || undefined}
        >
          <input
            ref={inputRef}
            id={fileId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="sr-only"
            disabled={pending}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          {picked ? "Elegir otra imagen" : "Añadir imagen"}
        </label>
        {picked && (
          <>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Subiendo…" : "Subir imagen"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => setPicked(null)}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </form>
  );
}
