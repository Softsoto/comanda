"use client";

import { THEME_LIMITS } from "@/lib/game-theme";
import { TextField } from "./fields";

/** Cómo se llama cada elemento de la lista (por defecto, "párrafo"). */
export type ListNoun = {
  /** Con mayúscula, para la etiqueta: "Párrafo 1". */
  label: string;
  /** En minúscula, para los botones: "Agregar párrafo". */
  one: string;
  plural: string;
  /** "el" o "la": "Subir el párrafo 1", "Subir la escena 1". */
  article: string;
  empty: string;
};

const PARAGRAPH: ListNoun = { label: "Párrafo", one: "párrafo", plural: "párrafos", article: "el", empty: "Un párrafo vacío no se muestra." };

/**
 * Los párrafos de un mensaje (o las escenas del secreto final): se pueden
 * escribir, agregar, quitar y cambiar de orden. Siempre queda al menos uno.
 */
export function ParagraphList({
  id,
  legend,
  paragraphs,
  max,
  onChange,
  itemMax = THEME_LIMITS.paragraph,
  noun = PARAGRAPH,
  hint,
}: {
  id: string;
  legend: string;
  paragraphs: string[];
  max: number;
  onChange: (paragraphs: string[]) => void;
  /** El largo máximo de cada elemento. */
  itemMax?: number;
  noun?: ListNoun;
  hint?: string;
}) {
  // Tras mover o quitar, el foco va al botón equivalente del párrafo que quedó en ese lugar.
  const focusLater = (target: string) => requestAnimationFrame(() => document.getElementById(target)?.focus());

  const move = (from: number, to: number) => {
    const next = [...paragraphs];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    // El mismo botón en el nuevo lugar; si ahí queda desactivado (en un extremo), el otro.
    const same = from > to ? "subir" : "bajar";
    const atEdge = (same === "subir" && to === 0) || (same === "bajar" && to === paragraphs.length - 1);
    focusLater(`${id}-${to}-${atEdge ? (same === "subir" ? "bajar" : "subir") : same}`);
  };
  const remove = (index: number) => {
    onChange(paragraphs.filter((_, i) => i !== index));
    focusLater(index < paragraphs.length - 1 ? `${id}-${index}` : `${id}-${index - 1}`);
  };
  const add = () => {
    onChange([...paragraphs, ""]);
    focusLater(`${id}-${paragraphs.length}`);
  };

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="label">{legend}</legend>
      {hint && <p className="hint -mt-2">{hint}</p>}
      <ol className="flex flex-col gap-3">
        {paragraphs.map((paragraph, index) => (
          <li key={index} className="rounded-field border border-line/40 p-3">
            <TextField
              id={`${id}-${index}`}
              label={`${noun.label} ${index + 1}`}
              value={paragraph}
              max={itemMax}
              multiline
              onChange={(value) => onChange(paragraphs.map((item, i) => (i === index ? value : item)))}
              hint={paragraph.trim() === "" ? noun.empty : undefined}
            />
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                id={`${id}-${index}-subir`}
                className="btn btn-ghost btn-sm"
                disabled={index === 0}
                aria-label={`Subir ${noun.article} ${noun.one} ${index + 1}`}
                onClick={() => move(index, index - 1)}
              >
                <span aria-hidden="true">↑</span> Subir
              </button>
              <button
                type="button"
                id={`${id}-${index}-bajar`}
                className="btn btn-ghost btn-sm"
                disabled={index === paragraphs.length - 1}
                aria-label={`Bajar ${noun.article} ${noun.one} ${index + 1}`}
                onClick={() => move(index, index + 1)}
              >
                <span aria-hidden="true">↓</span> Bajar
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger"
                disabled={paragraphs.length <= 1}
                aria-label={`Quitar ${noun.article} ${noun.one} ${index + 1}`}
                onClick={() => remove(index)}
              >
                Quitar
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <button type="button" className="btn btn-secondary btn-sm" disabled={paragraphs.length >= max} onClick={add}>
          <span aria-hidden="true">+</span> Agregar {noun.one}
        </button>
        <p className="hint">
          {paragraphs.length} de {max} {noun.plural} posibles.
        </p>
      </div>
    </fieldset>
  );
}
