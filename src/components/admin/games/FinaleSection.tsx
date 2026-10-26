"use client";

import { TROPHY, TROPHY_COLORS } from "@/components/secret/art";
import { PixelSprite } from "@/components/secret/PixelText";
import { SECRETS } from "@/components/secret/texts";
import { THEME_LIMITS, defaultTheme, type Finale } from "@/lib/game-theme";
import { ParagraphList, type ListNoun } from "./ParagraphList";
import { PixelPreview, PixelText, TextField } from "./fields";

const BASE = defaultTheme().finale;
/** Los mismos largos que acepta cleanTheme para el botón y el título. */
const BUTTON_MAX = 24;
const TITLE_MAX = 40;
const SCENE: ListNoun = { label: "Escena", one: "escena", plural: "escenas", article: "la", empty: "Una escena vacía no se muestra." };

/**
 * El secreto final: el botón de la portada que aparece con todos los logros y
 * la cinemática que abre (escenas, título del clímax y cierre).
 */
export function FinaleSection({
  finale,
  shortName,
  onChange,
  onWatch,
  busy,
}: {
  finale: Finale;
  shortName: string;
  onChange: (finale: Finale) => void;
  /** Abre los juegos en modo prueba con el botón del secreto final ya visible. */
  onWatch: () => void;
  busy: boolean;
}) {
  const set = (value: Partial<Finale>) => onChange({ ...finale, ...value });

  return (
    <section className="card" aria-labelledby="juegos-final">
      <h2 id="juegos-final" className="font-display text-title font-bold">
        Secreto final
      </h2>
      <p className="mt-1 text-sm text-muted">
        El premio por encontrarlo todo: una pequeña película de píxeles. Primero pasan las escenas, una frase en cada una; luego llega el título grande y, al final, los
        párrafos del cierre.
      </p>
      <div className="mt-3 mb-4 rounded-field border border-line/40 px-3 py-2.5 text-sm">
        <p className="font-semibold">¿Cuándo aparece el botón?</p>
        <ul className="mt-1 list-disc pl-5">
          <li>Cuando se consiguen todos los logros: los {SECRETS.length} mensajes secretos.</li>
          <li>
            O, sin esperar, al escribir el nombre corto (<span className="font-semibold uppercase">{shortName || "—"}</span>) con el teclado en la portada.
          </li>
        </ul>
        <p className="mt-1 text-muted">Desde ese momento el botón queda en la portada, en ese dispositivo, para volver a verla cuando quiera.</p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="tema-final-boton"
            label="Texto del botón"
            value={finale.button}
            max={BUTTON_MAX}
            fallback={BASE.button}
            hint="Sale en la portada, dorado y con una copa."
            onChange={(button) => set({ button })}
          />
          <TextField
            id="tema-final-titulo"
            label="Título del clímax"
            value={finale.title}
            max={TITLE_MAX}
            fallback={BASE.title}
            hint="Sale grande después de las escenas."
            onChange={(title) => set({ title })}
          />
        </div>

        <PixelPreview label="Así se ve el botón en la portada">
          <div className="flex justify-center py-2">
            <span className="inline-flex items-center gap-3 bg-[#ffe7a0] px-4 py-2.5 shadow-[inset_0_3px_#fffbe0,inset_0_-6px_#d9973a,0_0_0_3px_#06040e,0_0_18px_#ffd684]">
              <PixelSprite rows={TROPHY} colors={TROPHY_COLORS.oro} size={1} unit="t" />
              <PixelText color="#2a1238" label={finale.button || BASE.button}>
                {finale.button || BASE.button}
              </PixelText>
            </span>
          </div>
        </PixelPreview>

        <ParagraphList
          id="tema-final-escena"
          legend="Escenas"
          hint="Una frase corta por escena, en el orden en que pasan."
          paragraphs={finale.scenes}
          max={THEME_LIMITS.scenes}
          itemMax={THEME_LIMITS.scene}
          noun={SCENE}
          onChange={(scenes) => set({ scenes })}
        />
        <ParagraphList id="tema-final-cierre" legend="Párrafos del cierre" paragraphs={finale.closing} max={THEME_LIMITS.closing} onChange={(closing) => set({ closing })} />

        <div className="border-t border-line/25 pt-4">
          <button type="button" className="btn btn-secondary" disabled={busy} aria-describedby="tema-final-ver-ayuda" onClick={onWatch}>
            Ver la cinemática
          </button>
          <p id="tema-final-ver-ayuda" className="hint">
            Abre los juegos en modo prueba, con este borrador, y en la portada ya está el botón del secreto final. En este navegador quedará visible el botón.
          </p>
        </div>
      </div>
    </section>
  );
}
