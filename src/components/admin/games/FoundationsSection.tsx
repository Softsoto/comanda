"use client";

import { useState } from "react";
import { GAME_NAMES } from "@/components/secret/texts";
import { DEFAULT_FOUNDATIONS, FOUNDATION_LIMITS, type Foundation } from "@/lib/foundations";
import { PixelPreview, PixelText, TextField } from "./fields";

const same = (a: readonly Foundation[], b: readonly Foundation[]) => JSON.stringify(a) === JSON.stringify(b);

/** Una fundación sin nombre no se guarda; si además tiene ciudad o contacto, es un descuido que conviene avisar. */
export const foundationProblem = (item: Foundation) => item.name.trim().length < 2 && (item.place.trim() !== "" || item.contact.trim() !== "");

/**
 * Las fundaciones de animales que muestra el mensaje "Ayuda a un animalito"
 * de Casa de Patitas: se pueden escribir, agregar, quitar y cambiar de orden.
 */
export function FoundationsSection({ foundations, onChange }: { foundations: Foundation[]; onChange: (foundations: Foundation[]) => void }) {
  const [notice, setNotice] = useState("");
  const factory = same(foundations, DEFAULT_FOUNDATIONS);
  const max = FOUNDATION_LIMITS.count;
  const focusLater = (target: string) => requestAnimationFrame(() => document.getElementById(target)?.focus());

  const change = (next: Foundation[], text = "") => {
    onChange(next);
    setNotice(text);
  };
  const set = (index: number, value: Partial<Foundation>) => change(foundations.map((item, i) => (i === index ? { ...item, ...value } : item)));
  const move = (from: number, to: number) => {
    const next = [...foundations];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    change(next);
    const button = from > to ? (to === 0 ? "bajar" : "subir") : to === foundations.length - 1 ? "subir" : "bajar";
    focusLater(`fundacion-${to}-${button}`);
  };
  const remove = (index: number) => {
    const name = foundations[index].name.trim() || `la fundación ${index + 1}`;
    change(
      foundations.filter((_, i) => i !== index),
      `Quitaste ${name}.`,
    );
    focusLater(index < foundations.length - 1 ? `fundacion-${index}-nombre` : `fundacion-${index - 1}-nombre`);
  };
  const add = () => {
    change([...foundations, { name: "", place: "", contact: "" }]);
    focusLater(`fundacion-${foundations.length}-nombre`);
  };

  // En la vista previa, solo las que se van a guardar (con nombre); sin ninguna, vuelve la lista de fábrica.
  const shown = foundations.filter((item) => item.name.trim().length >= 2);
  const preview = shown.length > 0 ? shown : DEFAULT_FOUNDATIONS;

  return (
    <section className="card" aria-labelledby="juegos-fundaciones">
      <h2 id="juegos-fundaciones" className="font-display text-title font-bold">
        Fundaciones
      </h2>
      <p className="mt-1 text-sm text-muted">
        Al cuidar a las mascotas en {GAME_NAMES.mascotas} sale el mensaje “Ayuda a un animalito”, con fundaciones que rescatan perros y gatos. Aquí eliges cuáles salen y en
        qué orden.
      </p>
      <p className="mt-3 mb-4 rounded-field border border-line/40 px-3 py-2 text-sm">
        <strong className="font-semibold">Antes de difundirlas:</strong> los datos de la lista de fábrica vienen de notas de prensa colombiana y pueden haber cambiado.
        Conviene confirmarlos con cada fundación (que el usuario o el teléfono sigan siendo suyos).
      </p>

      <p className="mb-3 text-sm text-muted">
        De cada una: el nombre, la ciudad o región (por ejemplo “Guatavita, Cundinamarca”) y cómo encontrarla: su Instagram (@usuario), su página o su teléfono. En el
        juego sale como texto, sin enlace.
      </p>
      <ol className="flex flex-col gap-3">
        {foundations.map((item, index) => {
          const label = item.name.trim() || `Fundación ${index + 1}`;
          const problem = foundationProblem(item);
          return (
            <li key={index} className="rounded-field border border-line/40 p-3">
              <h3 className="mb-3 font-semibold">
                <span className="text-muted">{index + 1}.</span> {label}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <TextField
                    id={`fundacion-${index}-nombre`}
                    label="Nombre"
                    value={item.name}
                    max={FOUNDATION_LIMITS.name}
                    invalid={problem}
                    error={problem ? "Escribe el nombre (al menos 2 letras): sin nombre no se guarda." : undefined}
                    hint={!problem && item.name.trim() === "" ? "Si la dejas toda vacía, no se guarda." : undefined}
                    onChange={(name) => set(index, { name })}
                  />
                </div>
                <TextField
                  id={`fundacion-${index}-lugar`}
                  label="Ciudad o región"
                  value={item.place}
                  max={FOUNDATION_LIMITS.place}
                  onChange={(place) => set(index, { place })}
                />
                <TextField
                  id={`fundacion-${index}-contacto`}
                  label="Contacto"
                  value={item.contact}
                  max={FOUNDATION_LIMITS.contact}
                  onChange={(contact) => set(index, { contact })}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  id={`fundacion-${index}-subir`}
                  className="btn btn-ghost btn-sm"
                  disabled={index === 0}
                  aria-label={`Subir ${label}`}
                  onClick={() => move(index, index - 1)}
                >
                  <span aria-hidden="true">↑</span> Subir
                </button>
                <button
                  type="button"
                  id={`fundacion-${index}-bajar`}
                  className="btn btn-ghost btn-sm"
                  disabled={index === foundations.length - 1}
                  aria-label={`Bajar ${label}`}
                  onClick={() => move(index, index + 1)}
                >
                  <span aria-hidden="true">↓</span> Bajar
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm text-danger"
                  disabled={foundations.length <= 1}
                  aria-label={`Quitar ${label}`}
                  onClick={() => remove(index)}
                >
                  Quitar
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={foundations.length >= max} onClick={add}>
          <span aria-hidden="true">+</span> Agregar fundación
        </button>
        <button
          type="button"
          id="fundaciones-fabrica"
          className="btn btn-ghost btn-sm"
          disabled={factory}
          onClick={() => change([...DEFAULT_FOUNDATIONS], "Volvió la lista de fábrica. Pulsa Guardar para que quede así.")}
        >
          Volver a la lista de fábrica
        </button>
      </div>
      <p className="hint">
        {foundations.length} de {max} fundaciones posibles. Siempre queda al menos una.
      </p>
      <div role="status" className="empty:hidden">
        {notice && <p className="mt-3 rounded-field bg-brand-tint px-3 py-2 text-sm font-semibold text-ink">{notice}</p>}
      </div>

      <PixelPreview label={`Así se ve la tarjeta en ${GAME_NAMES.mascotas}`} className="mt-4">
        {/* Letras a 2 px, como en una pantalla de celular. */}
        <div className="mx-auto flex max-w-md flex-col gap-4 rounded-[4px] border-2 border-[#ffd684] p-3 [--bn-t:2px] [--bn-u:2px]">
          <PixelText as="p" size={2} unit="u" color="#ffd684" align="center">
            AYUDA A UN ANIMALITO
          </PixelText>
          <ul className="flex flex-col gap-3.5">
            {preview.map((item, index) => (
              <li key={index} className="flex flex-col gap-1.5">
                <PixelText as="p" color="#fff1b8" tall>
                  {item.name.trim()}
                </PixelText>
                {(item.place.trim() || item.contact.trim()) && (
                  <PixelText as="p" color="#c9c4e8" tall>
                    {[item.place.trim(), item.contact.trim()].filter(Boolean).join(" · ")}
                  </PixelText>
                )}
              </li>
            ))}
          </ul>
        </div>
        {shown.length === 0 && <p className="mt-2 text-caption text-[#c9c4e8]">Ninguna tiene nombre todavía: si guardas así, sale la lista de fábrica.</p>}
      </PixelPreview>
    </section>
  );
}
