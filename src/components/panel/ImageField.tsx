"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@/lib/config";

type Props = {
  label: string;
  /** Imagen que ya está guardada (si la hay). */
  currentUrl: string | null;
  /** "photo": foto de producto (JPG). "logo": conserva la transparencia (PNG). */
  variant: "photo" | "logo";
  error?: string;
  /** Recibe la imagen ya reducida, o null si no hay una nueva. */
  onChange: (image: Blob | null) => void;
};

const SETTINGS = {
  photo: { maxSide: 1000, type: "image/jpeg", quality: 0.82 },
  logo: { maxSide: 480, type: "image/png", quality: 1 },
} as const;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("no se pudo leer"));
    };
    image.src = url;
  });
}

/** Reduce la imagen en el navegador antes de subirla: carga más rápido y ocupa menos. */
async function shrinkImage(file: File, variant: "photo" | "logo"): Promise<Blob> {
  const { maxSide, type, quality } = SETTINGS[variant];
  const image = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("sin canvas");
  if (type === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("sin imagen"))), type, quality);
  });
}

/** Selector de imagen con vista previa. La imagen nueva se entrega al formulario con onChange. */
export function ImageField({ label, currentUrl, variant, error, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setProblem("");
    setBusy(true);
    try {
      const blob = await shrinkImage(file, variant);
      if (blob.size > LIMITS.maxImageBytes) throw new Error("muy grande");
      setPreviewUrl(URL.createObjectURL(blob));
      setRemoved(false);
      onChange(blob);
    } catch {
      setProblem("No pudimos leer esa imagen. Prueba con una foto JPG o PNG.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setPreviewUrl(null);
    setRemoved(true);
    setProblem("");
    onChange(null);
  }

  const shownUrl = previewUrl ?? (removed ? null : currentUrl);
  const message = problem || error;
  const inputId = `${variant}-archivo`;

  return (
    <div>
      <p className="label" id={`${inputId}-label`}>
        {label} <span className="font-normal text-muted">(opcional)</span>
      </p>
      <div className="flex items-center gap-4">
        <div
          className={`grid shrink-0 place-items-center overflow-hidden rounded-field border border-dashed border-line bg-surface text-center text-caption text-muted ${
            variant === "logo" ? "h-20 w-20" : "h-26 w-26"
          }`}
        >
          {shownUrl ? (
            <img
              src={shownUrl}
              alt="Vista previa"
              className={`h-full w-full ${variant === "logo" ? "object-contain" : "object-cover"}`}
            />
          ) : (
            "Sin imagen"
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label
            className="btn btn-secondary btn-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
            aria-disabled={busy || undefined}
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="sr-only"
              aria-labelledby={`${inputId}-label`}
              disabled={busy}
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            {busy ? "Preparando…" : shownUrl ? "Cambiar imagen" : "Elegir imagen"}
          </label>
          {shownUrl && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleRemove}>
              Quitar
            </button>
          )}
        </div>
      </div>
      <input type="hidden" name={variant === "logo" ? "removeLogo" : "removeImage"} value={removed ? "1" : ""} />
      {message ? (
        <p className="field-error" role="alert">
          {message}
        </p>
      ) : (
        <p className="hint">
          {variant === "logo"
            ? "Cuadrado se ve mejor. Se reduce sola antes de subirla."
            : "Una foto clara del producto. Se reduce sola antes de subirla."}
        </p>
      )}
    </div>
  );
}
