"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { applyTheme } from "@/components/secret/theme";
import { resetGameThemeAction, saveGameThemeAction, type ThemeSaveResult } from "@/lib/actions/games";
import { NAME_MAX, NAME_MIN } from "@/lib/game-name";
import { cleanTheme, defaultTheme, unknownSigns, type GameTheme } from "@/lib/game-theme";
import { isBlankArt } from "@/lib/sprite-convert";
import type { GameCode } from "@/lib/game-codes";
import { CodesSection } from "./CodesSection";
import { FinaleSection } from "./FinaleSection";
import { FoundationsSection, foundationProblem } from "./FoundationsSection";
import { SpritesSection } from "./SpritesSection";
import { TextsSection } from "./TextsSection";
import { WorldsSection } from "./WorldsSection";

type Game = ComponentType<{ onClose: () => void }>;
type Message = Pick<ThemeSaveResult, "ok" | "message" | "problems">;

const SECTIONS = [
  ["juegos-portada", "Portada"],
  ["juegos-nombre", "Nombre"],
  ["juegos-mensaje", "Mensaje"],
  ["juegos-secretos", "Logros"],
  ["juegos-final", "Secreto final"],
  ["juegos-codigos", "Códigos"],
  ["juegos-personajes", "Personajes"],
  ["juegos-paisajes", "Paisajes"],
  ["juegos-fundaciones", "Fundaciones"],
  ["juegos-copias", "Copias"],
] as const;

/** Lo que lee BlocksGame para mostrar en la portada el botón del secreto final. */
const FINALE_KEY = "dos-lunas:final";

const same = (a: GameTheme, b: GameTheme) => JSON.stringify(a) === JSON.stringify(b);

/**
 * El panel de diseño de los juegos escondidos: textos, nombre y personajes.
 * Todo se cambia en un borrador; "Probar" abre los juegos con el borrador y
 * "Guardar" lo deja para todos.
 */
export function GameDesigner({ initial, codes, codeUses }: { initial: GameTheme; codes: GameCode[]; codeUses: Record<string, number> }) {
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState<"" | "guardar" | "probar" | "cinematica" | "reiniciar">("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [Game, setGame] = useState<Game | null>(null);
  const [codesDirty, setCodesDirty] = useState(false);
  const onCodesDirty = useCallback((value: boolean) => setCodesDirty(value), []);
  const importer = useRef<HTMLInputElement>(null);

  const dirty = !same(draft, saved);
  const nameError = draft.name.length < NAME_MIN ? `Escribe entre ${NAME_MIN} y ${NAME_MAX} letras.` : undefined;
  const shortNameError = draft.shortName.length < 2 ? "Escribe al menos 2 letras." : undefined;
  const signs = unknownSigns(draft);

  // Aviso del navegador al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (change: (theme: GameTheme) => GameTheme) => {
    setDraft(change);
    setMessage(null);
  };

  async function save() {
    if (nameError || shortNameError) {
      setMessage({ ok: false, message: "Revisa los campos marcados antes de guardar.", problems: [] });
      document.getElementById(nameError ? "tema-nombre" : "tema-nombre-corto")?.focus();
      return;
    }
    const nameless = draft.foundations.findIndex(foundationProblem);
    if (nameless >= 0) {
      setMessage({ ok: false, message: "A una fundación le falta el nombre. Escríbelo o quítala antes de guardar.", problems: [] });
      document.getElementById(`fundacion-${nameless}-nombre`)?.focus();
      return;
    }
    const blank = Object.entries(draft.sprites).find(([, art]) => art && isBlankArt(art));
    if (blank) {
      setMessage({ ok: false, message: "Hay un dibujo vacío. Pinta algo o vuelve al original antes de guardar.", problems: [] });
      return;
    }
    setBusy("guardar");
    try {
      const result = await saveGameThemeAction(JSON.stringify(draft));
      setMessage(result);
      if (result.ok) {
        // Lo mismo que guardó el servidor (espacios de más, párrafos vacíos fuera).
        const clean = cleanTheme(draft).theme;
        setDraft(clean);
        setSaved(clean);
      }
    } catch {
      setMessage({ ok: false, message: "No se pudo guardar: revisa la conexión e inténtalo otra vez.", problems: [] });
    }
    setBusy("");
  }

  async function reset() {
    setBusy("reiniciar");
    try {
      const result = await resetGameThemeAction();
      setMessage(result);
      if (result.ok) {
        setDraft(defaultTheme());
        setSaved(defaultTheme());
      }
    } catch {
      setMessage({ ok: false, message: "No se pudo volver a lo de siempre: revisa la conexión e inténtalo otra vez.", problems: [] });
    }
    setConfirmReset(false);
    setBusy("");
    requestAnimationFrame(() => document.getElementById("juegos-reiniciar")?.focus());
  }

  /** Abre los juegos con el borrador; con `finale`, ya con el botón del secreto final en la portada. */
  async function test(finale = false) {
    setBusy(finale ? "cinematica" : "probar");
    if (finale) {
      try {
        localStorage.setItem(FINALE_KEY, "si");
      } catch {
        // Sin almacenamiento, el botón aparece igual al escribir el nombre corto en la portada.
      }
    }
    try {
      const loaded = await import("@/components/secret/BlocksGame");
      applyTheme(draft);
      setGame(() => loaded.default);
    } catch {
      setMessage({ ok: false, message: "No se pudieron abrir los juegos. Revisa la conexión e inténtalo otra vez.", problems: [] });
    }
    setBusy("");
  }

  function download() {
    const blob = new Blob([JSON.stringify(cleanTheme(draft).theme, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dos-lunas-personalizacion.json";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ ok: true, message: "Copia descargada. Con “Importar copia” la puedes volver a cargar aquí o en otra instalación.", problems: [] });
  }

  async function load(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("grande");
      const parsed = JSON.parse(await file.text()) as unknown;
      const input = parsed && typeof parsed === "object" && "theme" in parsed ? (parsed as { theme: unknown }).theme : parsed;
      if (!input || typeof input !== "object") throw new Error("vacío");
      const { theme, problems } = cleanTheme(input);
      setDraft(theme);
      setMessage({ ok: true, message: "Copia cargada. Revisa cómo quedó y pulsa Guardar para usarla en los juegos.", problems });
    } catch {
      setMessage({ ok: false, message: "Ese archivo no es una copia de la personalización de los juegos.", problems: [] });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Partes del panel" className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <ul className="flex gap-1.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="btn btn-secondary btn-sm whitespace-nowrap">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <TextsSection theme={draft} update={update} nameError={nameError} shortNameError={shortNameError} />

      <FinaleSection
        finale={draft.finale}
        shortName={draft.shortName}
        busy={busy !== ""}
        onChange={(finale) => update((theme) => ({ ...theme, finale }))}
        onWatch={() => void test(true)}
      />

      <CodesSection initial={codes} uses={codeUses} signature={draft.signature || defaultTheme().signature} onDirtyChange={onCodesDirty} />

      <SpritesSection
        sprites={draft.sprites}
        onChange={(slot, art) =>
          update((theme) => {
            const sprites = { ...theme.sprites };
            if (art) sprites[slot] = art;
            else delete sprites[slot];
            return { ...theme, sprites };
          })
        }
      />

      <WorldsSection worlds={draft.worlds} onChange={(worlds) => update((theme) => ({ ...theme, worlds }))} />

      <FoundationsSection foundations={draft.foundations} onChange={(foundations) => update((theme) => ({ ...theme, foundations }))} />

      <section className="card" aria-labelledby="juegos-copias">
        <h2 id="juegos-copias" className="font-display text-title font-bold">
          Copias y volver a empezar
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Descarga una copia de tus textos, logros, secreto final, dibujos, paisajes y fundaciones para guardarla o pasarla a otra instalación. “Volver a lo de siempre” deja los juegos como vinieron. Los códigos no van en esta copia ni se borran con “Volver a lo de siempre”: quedan en la copia de seguridad de Administración → Ajustes.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary" onClick={download}>
            Descargar copia
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => importer.current?.click()}>
            Importar copia
          </button>
          <input
            ref={importer}
            id="juegos-importar"
            type="file"
            accept="application/json,.json"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              void load(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <button type="button" id="juegos-reiniciar" className="btn btn-danger" aria-expanded={confirmReset} aria-controls="juegos-confirmar" onClick={() => setConfirmReset((open) => !open)}>
            Volver a lo de siempre
          </button>
        </div>
        <div id="juegos-confirmar">
          {confirmReset && (
            <div className="mt-4 rounded-field border border-danger p-3" role="group" aria-labelledby="juegos-confirmar-texto">
              <p id="juegos-confirmar-texto" className="text-sm font-semibold">
                ¿Seguro? Se borran tus textos, el nombre, los trofeos de los logros, el secreto final, los dibujos propios, los paisajes elegidos y tus fundaciones, y los juegos vuelven a los de siempre. Si quieres conservarlos, primero descarga una copia.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-danger btn-sm" disabled={busy !== ""} onClick={() => void reset()}>
                  {busy === "reiniciar" ? "Volviendo…" : "Sí, volver a lo de siempre"}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* La barra de guardar: siempre a la vista, pegada abajo. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line/25 bg-raised px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-t-card sm:px-5">
        <div role="status" className="mb-2 empty:hidden">
          {message ? (
            <div className={message.ok ? "rounded-field bg-brand-tint px-3 py-2 text-sm text-ink" : "rounded-field border border-danger px-3 py-2 text-sm text-danger"}>
              <p className="font-semibold">{message.message}</p>
              {message.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {message.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : signs.length > 0 ? (
            <p className="text-sm font-semibold text-danger">
              Hay signos que las letras del juego no tienen y saldrán como “?”: {signs.map((sign) => `“${sign}”`).join(" ")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-muted">
            {dirty ? "Tienes cambios sin guardar." : codesDirty ? "El resto está guardado." : "Todo está guardado."}
            {codesDirty && (
              <>
                {" "}
                <a href="#codigos-guardar" className="link">
                  Faltan los códigos
                </a>
                .
              </>
            )}
          </p>
          <button type="button" className="btn btn-secondary" disabled={busy !== ""} onClick={() => void test()}>
            {busy === "probar" ? "Abriendo…" : "Probar"}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy !== "" || !dirty} onClick={() => void save()}>
            {busy === "guardar" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>

      {Game && (
        <Game
          onClose={() => {
            applyTheme(saved);
            setGame(null);
          }}
        />
      )}
    </div>
  );
}
