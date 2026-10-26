"use client";

import { useEffect, useRef, useState } from "react";
import { SPRITE_SLOTS, type SpriteArt, type SpriteSlot } from "@/lib/game-theme";
import { resizeArt, type RGBAImage } from "@/lib/sprite-convert";
import { IMAGE_TYPES, ImageConverter, readImage } from "./ImageConverter";
import { BIG_OF, originalArt } from "./original-art";
import { PixelEditor } from "./PixelEditor";
import { SpriteView } from "./SpriteView";

type Slot = (typeof SPRITE_SLOTS)[number];
type Open = { kind: "convert"; slot: Slot; image: RGBAImage; url: string } | { kind: "edit"; slot: Slot; art: SpriteArt; from: string };

const nameOf = (slot: Slot) => `${slot.label} (${slot.size})`;
const slotOf = (id: SpriteSlot) => SPRITE_SLOTS.find((slot) => slot.id === id)!;

/** Los personajes: una tarjeta por cada uno, con su dibujo y cómo cambiarlo. */
export function SpritesSection({ sprites, onChange }: { sprites: Partial<Record<SpriteSlot, SpriteArt>>; onChange: (slot: SpriteSlot, art: SpriteArt | undefined) => void }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<{ slot: SpriteSlot; ok: boolean; text: string } | null>(null);
  const files = useRef<Partial<Record<SpriteSlot, HTMLInputElement | null>>>({});

  // La imagen subida se suelta al cerrar el convertidor.
  useEffect(() => {
    if (open?.kind !== "convert") return;
    const { url } = open;
    return () => URL.revokeObjectURL(url);
  }, [open]);

  const artOf = (slot: Slot) => sprites[slot.id] ?? originalArt(slot.id);
  // Al cerrar una ventana, el foco vuelve al botón de la tarjeta.
  const backTo = (slot: Slot, button: string) => requestAnimationFrame(() => document.getElementById(`personaje-${slot.id}-${button}`)?.focus());

  async function upload(slot: Slot, file: File | undefined) {
    if (!file) return;
    setNotice(null);
    try {
      const { image, url } = await readImage(file);
      setOpen({ kind: "convert", slot, image, url });
    } catch (error) {
      setNotice({ slot: slot.id, ok: false, text: error instanceof Error ? error.message : "No se pudo abrir la imagen." });
    }
  }

  function fromBig(slot: Slot) {
    const big = slotOf(BIG_OF[slot.id]!);
    setOpen({ kind: "edit", slot, art: resizeArt(artOf(big), slot.width, slot.height), from: "pequeno" });
  }

  return (
    <section className="card" aria-labelledby="juegos-personajes">
      <h2 id="juegos-personajes" className="font-display text-title font-bold">
        Personajes
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        Pon tus propios dibujos en lugar de la ninja, el espíritu, la flor y el auto. Puedes subir una foto o un dibujo (se convierte solo a la medida) o pintarlo píxel por
        píxel. Cada personaje tiene un dibujo grande, para la portada y el mensaje, y uno pequeño para dentro de los juegos.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SPRITE_SLOTS.map((slot) => {
          const custom = !!sprites[slot.id];
          const art = artOf(slot);
          const scale = Math.min(24, Math.floor(132 / Math.max(slot.width, slot.height)));
          const big = BIG_OF[slot.id];
          return (
            <li key={slot.id} className="flex flex-col gap-3 rounded-field border border-line/40 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h3 id={`personaje-${slot.id}-nombre`} className="font-semibold">
                  {nameOf(slot)}
                </h3>
                <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${custom ? "bg-brand-tint text-ink" : "border border-line text-muted"}`}>
                  {custom ? "Dibujo propio" : "Original"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-field border border-line/40 checker" style={{ ["--checker-size" as string]: "8px" }}>
                  <SpriteView art={art} scale={scale} backdrop="none" label={`Dibujo ${custom ? "propio" : "original"} de ${nameOf(slot).toLowerCase()}`} />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-sm">
                    <strong className="font-semibold">
                      {slot.width} × {slot.height} píxeles
                    </strong>
                    <span className="block text-muted">{slot.uses}</span>
                  </p>
                  <div className="w-fit rounded-[4px] bg-[#0b0a24] p-1.5" title="Así se ve en el juego">
                    <SpriteView art={art} scale={2} backdrop="none" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <input
                  ref={(element) => {
                    files.current[slot.id] = element;
                  }}
                  id={`personaje-${slot.id}-archivo`}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(event) => {
                    void upload(slot, event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
                <button type="button" id={`personaje-${slot.id}-subir`} className="btn btn-secondary btn-sm" aria-label={`Subir imagen para ${nameOf(slot).toLowerCase()}`} onClick={() => files.current[slot.id]?.click()}>
                  Subir imagen
                </button>
                <button type="button" id={`personaje-${slot.id}-editar`} className="btn btn-secondary btn-sm" aria-label={`Editar el dibujo de ${nameOf(slot).toLowerCase()}`} onClick={() => setOpen({ kind: "edit", slot, art, from: "editar" })}>
                  Editar
                </button>
                {big && (
                  <button type="button" id={`personaje-${slot.id}-pequeno`} className="btn btn-secondary btn-sm" aria-label={`Hacer a partir del grande: ${slot.label.toLowerCase()} pequeño`} onClick={() => fromBig(slot)}>
                    Hacer a partir del grande
                  </button>
                )}
                <button
                  type="button"
                  id={`personaje-${slot.id}-original`}
                  className="btn btn-ghost btn-sm"
                  disabled={!custom}
                  aria-label={`Volver al original: ${nameOf(slot).toLowerCase()}`}
                  onClick={() => {
                    onChange(slot.id, undefined);
                    setNotice({ slot: slot.id, ok: true, text: "Volvió el dibujo original. Pulsa Guardar para que quede así." });
                    backTo(slot, "editar");
                  }}
                >
                  Volver al original
                </button>
              </div>
              <div role="status" className="-mt-3">
                {notice?.slot === slot.id && (
                  <p className={notice.ok ? "mt-3 rounded-field bg-brand-tint px-3 py-2 text-sm font-semibold text-ink" : "mt-3 rounded-field border border-danger px-3 py-2 text-sm font-semibold text-danger"}>
                    {notice.text}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {open?.kind === "convert" && (
        <ImageConverter
          key={open.url}
          title={`Convertir imagen: ${nameOf(open.slot).toLowerCase()}`}
          width={open.slot.width}
          height={open.slot.height}
          image={open.image}
          url={open.url}
          onAccept={(art) => setOpen({ kind: "edit", slot: open.slot, art, from: "subir" })}
          onCancel={() => {
            backTo(open.slot, "subir");
            setOpen(null);
          }}
        />
      )}
      {open?.kind === "edit" && (
        <PixelEditor
          key={`${open.slot.id}-${open.from}`}
          title={`Editar: ${nameOf(open.slot).toLowerCase()}`}
          width={open.slot.width}
          height={open.slot.height}
          initial={open.art}
          onAccept={(art) => {
            onChange(open.slot.id, art);
            setNotice({ slot: open.slot.id, ok: true, text: "Listo: ahora usa tu dibujo. Pulsa Guardar para que quede en los juegos." });
          }}
          onCancel={() => {
            backTo(open.slot, open.from);
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
