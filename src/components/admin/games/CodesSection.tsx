"use client";

import { useEffect, useState } from "react";
import { missingGlyphs } from "@/components/secret/pixel-font";
import { PixelSprite } from "@/components/secret/PixelText";
import { FLOWER, FLOWER_COLORS } from "@/components/secret/art";
import { UI } from "@/components/secret/texts";
import { saveGameCodesAction, type ThemeSaveResult } from "@/lib/actions/games";
import { CODE_LIMITS, cleanCodes, codeKey, normalizeCode, type GameCode } from "@/lib/game-codes";
import { ParagraphList } from "./ParagraphList";
import { PixelPreview, PixelText, TextField } from "./fields";

type Message = Pick<ThemeSaveResult, "ok" | "message" | "problems">;

const same = (a: readonly GameCode[], b: readonly GameCode[]) => JSON.stringify(a) === JSON.stringify(b);
const NIGHT = "#06040e";

/** Lo que le falta a un código para poder guardarse (o null si está completo). */
function codeProblem(item: GameCode, list: readonly GameCode[], index: number): { field: "codigo" | "titulo" | "parrafo"; text: string } | null {
  const key = codeKey(item.code);
  if (key.length < CODE_LIMITS.codeMin) return { field: "codigo", text: `Escribe un código de al menos ${CODE_LIMITS.codeMin} letras o números.` };
  const twin = list.findIndex((other, i) => i !== index && codeKey(other.code) === key);
  if (twin >= 0) return { field: "codigo", text: `Es el mismo código que el ${twin + 1}.º: el juego no los distinguiría. Cámbialo.` };
  if (item.title.trim() === "") return { field: "titulo", text: "Escribe el título del anuncio." };
  if (!item.text.some((line) => line.trim() !== "")) return { field: "parrafo", text: "Escribe al menos un párrafo." };
  return null;
}

/**
 * Los códigos de la consola de los juegos: el administrador los inventa y los
 * reparte a mano; quien escribe uno en "Consola" (portada de los juegos) ve su
 * anuncio. Se guardan aparte de la personalización, porque esa es pública.
 */
export function CodesSection({
  initial,
  uses,
  signature,
  onDirtyChange,
}: {
  initial: GameCode[];
  /** Cuántas veces se usó cada código (por el código guardado). */
  uses: Record<string, number>;
  /** La firma del mensaje, que también sale al pie de los anuncios. */
  signature: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [codes, setCodes] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<Message | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  /** Tras un intento de guardar con faltas, se marcan todas; antes, solo lo que ya está mal escrito. */
  const [tried, setTried] = useState(false);

  const dirty = !same(codes, saved);
  const max = CODE_LIMITS.count;
  const focusLater = (target: string) => requestAnimationFrame(() => document.getElementById(target)?.focus());
  // Los usos se anotan con el código guardado; se buscan sin guiones, como compara el juego.
  const useCount = (code: string) => Object.entries(uses).reduce((sum, [key, count]) => (codeKey(key) === codeKey(code) ? sum + count : sum), 0);
  const signs = [...new Set(codes.flatMap((item) => missingGlyphs([item.title, ...item.text].join(" "))))];

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Aviso del navegador al salir con códigos sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: GameCode[], text = "") => {
    setCodes(next);
    setNotice(text);
    setMessage(null);
  };
  const set = (index: number, value: Partial<GameCode>) => change(codes.map((item, i) => (i === index ? { ...item, ...value } : item)));
  const move = (from: number, to: number) => {
    const next = [...codes];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    change(next);
    const button = from > to ? (to === 0 ? "bajar" : "subir") : to === codes.length - 1 ? "subir" : "bajar";
    focusLater(`codigo-${to}-${button}`);
  };
  const remove = (index: number) => {
    const name = codes[index].code || `el código ${index + 1}`;
    change(
      codes.filter((_, i) => i !== index),
      `Quitaste ${name}. Pulsa “Guardar códigos” para que deje de funcionar.`,
    );
    focusLater(codes.length === 1 ? "codigos-agregar" : index < codes.length - 1 ? `codigo-${index}-codigo` : `codigo-${index - 1}-codigo`);
  };
  const add = () => {
    change([...codes, { code: "", title: "", text: [""], active: true }]);
    focusLater(`codigo-${codes.length}-codigo`);
  };

  async function save() {
    const bad = codes.findIndex((item, index) => codeProblem(item, codes, index));
    if (bad >= 0) {
      setTried(true);
      const problem = codeProblem(codes[bad], codes, bad)!;
      setMessage({ ok: false, message: `Al código ${bad + 1}.º le falta algo: ${problem.text.charAt(0).toLowerCase()}${problem.text.slice(1)} Complétalo o quítalo antes de guardar.`, problems: [] });
      focusLater(problem.field === "parrafo" ? `codigo-${bad}-parrafo-0` : `codigo-${bad}-${problem.field}`);
      return;
    }
    setBusy(true);
    try {
      const result = await saveGameCodesAction(JSON.stringify(codes));
      setMessage(result);
      if (result.ok) {
        // Lo mismo que guardó el servidor (espacios de más y párrafos vacíos fuera).
        const clean = cleanCodes(codes);
        setCodes(clean);
        setSaved(clean);
        setTried(false);
      }
    } catch {
      setMessage({ ok: false, message: "No se pudieron guardar los códigos: revisa la conexión e inténtalo otra vez.", problems: [] });
    }
    setNotice("");
    setBusy(false);
  }

  return (
    <section className="card" aria-labelledby="juegos-codigos">
      <h2 id="juegos-codigos" className="font-display text-title font-bold">
        Códigos
      </h2>
      <p className="mt-1 text-sm text-muted">
        Tú los inventas y los repartes a mano; quien tenga uno lo escribe en “{UI.console}”, en la portada de los juegos, y le aparece tu anuncio. Nadie más puede verlos.
      </p>
      <p className="mt-3 mb-4 rounded-field border border-line/40 px-3 py-2 text-sm">
        <strong className="font-semibold">Se guardan aparte:</strong> tienen su propio botón “Guardar códigos”, abajo, y no cambian con el “Guardar” del resto del panel. No
        importan las mayúsculas, las tildes, los espacios ni los guiones: “dos lunas” sirve para DOSLUNAS.
      </p>

      {codes.length === 0 ? (
        <p className="rounded-field border border-dashed border-line/60 px-3 py-4 text-center text-sm text-muted">
          No hay códigos. Si guardas así, la consola no aceptará ninguno.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {codes.map((item, index) => {
            const found = codeProblem(item, codes, index);
            const problem = found && (tried || (found.field === "codigo" && item.code !== "")) ? found : null;
            const label = item.code || `Código ${index + 1}`;
            const count = useCount(item.code);
            const shownText = item.text.filter((line) => line.trim() !== "");
            return (
              <li key={index} className={`flex flex-col gap-3 rounded-field border p-3 ${item.active ? "border-line/40" : "border-dashed border-line/60"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 id={`codigo-${index}-nombre`} className="min-w-0 font-semibold break-all">
                    <span className="text-muted">{index + 1}.</span> {label}
                  </h3>
                  <span className="flex shrink-0 flex-wrap gap-1.5">
                    <span className={`rounded-full px-2.5 py-0.5 text-caption font-semibold ${item.active ? "bg-brand-tint text-ink" : "border border-line text-muted"}`}>
                      {item.active ? "Activo" : "Apagado"}
                    </span>
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-caption font-semibold tabular-nums" id={`codigo-${index}-usos`}>
                      {count === 0 ? "Sin usar" : count === 1 ? "Usado 1 vez" : `Usado ${count} veces`}
                    </span>
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id={`codigo-${index}-codigo`}
                    label="Código"
                    value={item.code}
                    max={CODE_LIMITS.code}
                    transform={normalizeCode}
                    inputClassName="font-mono uppercase tracking-wider"
                    invalid={problem?.field === "codigo"}
                    error={problem?.field === "codigo" ? problem.text : undefined}
                    hint={problem?.field === "codigo" ? undefined : "Así lo compara el juego: letras sin tilde, números y guiones."}
                    onChange={(code) => set(index, { code })}
                  />
                  <TextField
                    id={`codigo-${index}-titulo`}
                    label="Título del anuncio"
                    value={item.title}
                    max={CODE_LIMITS.title}
                    invalid={problem?.field === "titulo"}
                    error={problem?.field === "titulo" ? problem.text : undefined}
                    onChange={(title) => set(index, { title })}
                  />
                </div>

                <ParagraphList
                  id={`codigo-${index}-parrafo`}
                  legend="Párrafos del anuncio"
                  paragraphs={item.text}
                  max={CODE_LIMITS.paragraphs}
                  itemMax={CODE_LIMITS.paragraph}
                  onChange={(text) => set(index, { text })}
                />
                {problem?.field === "parrafo" && <p className="field-error -mt-1">{problem.text}</p>}

                <PixelPreview label="Así se ve el anuncio en el juego">
                  {/* Letras a 2 px, como en una pantalla de celular. */}
                  <div className="flex flex-col items-center gap-3 [--bn-l:2px] [--bn-t:2px]">
                    <PixelText as="p" color="#ffd684" outline={NIGHT} align="center">
                      {UI.codeUnlocked}
                    </PixelText>
                    <div className="flex w-full max-w-md flex-col gap-4 bg-[#f4e8c6] p-4 text-[#2b1b3d] shadow-[0_0_0_2px_#8a6a35]">
                      <div className="flex flex-col items-center gap-2.5">
                        <PixelText as="p" unit="l" color="#b5281f" align="center">
                          {item.title.trim() || "Título del anuncio"}
                        </PixelText>
                        <PixelSprite rows={FLOWER} colors={FLOWER_COLORS} unit="l" size={2} />
                      </div>
                      {(shownText.length > 0 ? shownText : ["Aquí van los párrafos."]).map((line, position) => (
                        <PixelText key={position} as="p" unit="l" tall>
                          {line}
                        </PixelText>
                      ))}
                      {signature.trim() && (
                        <PixelText as="p" unit="l" tall color="#8a3b1e" align="end">
                          {signature}
                        </PixelText>
                      )}
                    </div>
                  </div>
                </PixelPreview>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    role="switch"
                    id={`codigo-${index}-activo`}
                    aria-checked={item.active}
                    aria-labelledby={`codigo-${index}-nombre codigo-${index}-activo-texto`}
                    className="group flex min-h-11 cursor-pointer items-center gap-2.5 rounded-full pr-2"
                    onClick={() => set(index, { active: !item.active })}
                  >
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors ${item.active ? "border-brand bg-brand" : "border-line bg-raised"}`}
                    >
                      <span className={`absolute size-5 rounded-full shadow-sm transition-[left] ${item.active ? "left-[calc(100%-1.375rem)] bg-on-brand" : "left-0.5 bg-line"}`} />
                    </span>
                    <span id={`codigo-${index}-activo-texto`} className="text-sm font-semibold">
                      Activo
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      id={`codigo-${index}-subir`}
                      className="btn btn-ghost btn-sm px-3"
                      disabled={index === 0}
                      aria-label={`Subir ${label}`}
                      onClick={() => move(index, index - 1)}
                    >
                      <span aria-hidden="true">↑</span> Subir
                    </button>
                    <button
                      type="button"
                      id={`codigo-${index}-bajar`}
                      className="btn btn-ghost btn-sm px-3"
                      disabled={index === codes.length - 1}
                      aria-label={`Bajar ${label}`}
                      onClick={() => move(index, index + 1)}
                    >
                      <span aria-hidden="true">↓</span> Bajar
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm px-3 text-danger" aria-label={`Quitar ${label}`} onClick={() => remove(index)}>
                      Quitar
                    </button>
                  </div>
                </div>
                {!item.active && <p className="-mt-1 text-caption text-muted">Apagado: si alguien lo escribe, la consola le dice que no existe. Lo puedes volver a encender cuando quieras.</p>}
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-3">
        <button type="button" id="codigos-agregar" className="btn btn-secondary btn-sm" disabled={codes.length >= max} onClick={add}>
          <span aria-hidden="true">+</span> Agregar código
        </button>
        <p className="hint">
          {codes.length} de {max} códigos posibles.
        </p>
      </div>
      <div role="status" className="empty:hidden">
        {notice && <p className="mt-3 rounded-field bg-brand-tint px-3 py-2 text-sm font-semibold text-ink">{notice}</p>}
      </div>

      <div className="mt-4 border-t border-line/25 pt-4">
        <div role="status" className="mb-3 empty:hidden">
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
          <p className="mr-auto text-sm text-muted">{dirty ? "Los códigos tienen cambios sin guardar." : "Los códigos están guardados."}</p>
          <button type="button" id="codigos-guardar" className="btn btn-primary" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "Guardando…" : "Guardar códigos"}
          </button>
        </div>
        <p className="hint">Para probar un código en la consola, primero guárdalo.</p>
      </div>
    </section>
  );
}
