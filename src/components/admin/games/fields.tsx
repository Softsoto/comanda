"use client";

import type { ReactNode } from "react";
import { missingGlyphs } from "@/components/secret/pixel-font";
import { PixelText } from "@/components/secret/PixelText";
import { TROPHY, TROPHY_COLORS } from "@/components/secret/art";
import type { Trophy } from "@/components/secret/texts";
import { SpriteView } from "./SpriteView";

/** Aviso de signos que las letras de píxeles no saben dibujar (salen como "?"). */
export function GlyphWarning({ id, text }: { id: string; text: string }) {
  const missing = missingGlyphs(text);
  if (missing.length === 0) return null;
  return (
    <p id={id} className="field-error">
      Las letras del juego no tienen {missing.length === 1 ? "este signo" : "estos signos"}: {missing.map((sign) => `“${sign}”`).join(" ")}. En
      pantalla {missing.length === 1 ? "saldría" : "saldrían"} como “?”.
    </p>
  );
}

/**
 * Un campo de texto del panel: etiqueta, contador de largo, ayuda y aviso de
 * signos que no se pueden dibujar. Si se deja vacío, el juego usa el de siempre.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  max,
  hint,
  fallback,
  multiline = false,
  invalid,
  error,
  inputClassName = "",
  transform,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  hint?: ReactNode;
  /** El texto de siempre, que se usa si el campo queda vacío. */
  fallback?: string;
  multiline?: boolean;
  invalid?: boolean;
  error?: string;
  inputClassName?: string;
  /** Para campos que solo aceptan ciertas letras (el nombre). */
  transform?: (value: string) => string;
}) {
  const ids = [`${id}-cuenta`, hint ? `${id}-ayuda` : "", error ? `${id}-error` : "", missingGlyphs(value).length ? `${id}-signos` : ""].filter(Boolean).join(" ");
  const change = (next: string) => onChange(transform ? transform(next) : next);
  const empty = value.trim() === "";
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className={`field min-h-24 resize-y ${inputClassName}`}
          value={value}
          maxLength={max}
          rows={3}
          onChange={(event) => change(event.target.value)}
          aria-describedby={ids}
          aria-invalid={invalid || undefined}
        />
      ) : (
        <input
          id={id}
          className={`field ${inputClassName}`}
          value={value}
          maxLength={max}
          autoComplete="off"
          onChange={(event) => change(event.target.value)}
          aria-describedby={ids}
          aria-invalid={invalid || undefined}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <div className="min-w-0 flex-1">
          {hint && (
            <p id={`${id}-ayuda`} className="hint">
              {hint}
            </p>
          )}
          {empty && fallback && !error && <p className="hint">Vacío: se usará el de siempre (“{fallback}”).</p>}
        </div>
        <p id={`${id}-cuenta`} className="hint tabular-nums">
          <span className="sr-only">Llevas </span>
          {value.length} de {max}
          <span className="sr-only"> caracteres</span>
        </p>
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
      <GlyphWarning id={`${id}-signos`} text={value} />
    </div>
  );
}

/** Una vista previa con las letras de píxeles del juego, sobre la noche de sus paisajes. */
export function PixelPreview({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <figure className={`pixel-preview overflow-hidden rounded-field bg-[#0b0a24] p-3 text-[#f7f2ff] ${className}`}>
      <figcaption className="mb-2 text-caption font-semibold text-[#c9c4e8]">{label}</figcaption>
      {children}
    </figure>
  );
}

export { PixelText };

/** La copa de pixel art de un trofeo, la misma de los juegos. Decorativa: el texto de al lado dice cuál es. */
export function TrophyIcon({ trophy, scale = 3, className = "" }: { trophy: Trophy | "nada"; scale?: number; className?: string }) {
  return <SpriteView art={{ rows: [...TROPHY], colors: { ...TROPHY_COLORS[trophy] } }} scale={scale} backdrop="none" className={`shrink-0 ${className}`} />;
}

/** El nombre de cada trofeo, para mostrarlo. */
export const TROPHY_NAMES: Record<Trophy, string> = { bronce: "Bronce", plata: "Plata", oro: "Oro" };
