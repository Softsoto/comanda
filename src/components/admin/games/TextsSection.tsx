"use client";

import { GAME_NAMES, SECRETS, TROPHY_POINTS } from "@/components/secret/texts";
import { NAME_MAX, NAME_MIN, cleanGameName } from "@/lib/game-name";
import { THEME_LIMITS, TROPHIES, defaultTheme, hintFor, type GameTheme, type SecretText } from "@/lib/game-theme";
import { ParagraphList } from "./ParagraphList";
import { PixelPreview, PixelText, TROPHY_NAMES, TextField, TrophyIcon } from "./fields";

const BASE = defaultTheme();
const NIGHT = "#06040e";

/** Solo letras, en mayúsculas, como las acepta el juego. */
const lettersOnly = (max: number) => (value: string) => cleanGameName(value).slice(0, max);

export type ThemeUpdate = (change: (theme: GameTheme) => GameTheme) => void;

/** Los textos de los juegos: portada, nombre, mensaje y mensajes secretos. */
export function TextsSection({ theme, update, nameError, shortNameError }: { theme: GameTheme; update: ThemeUpdate; nameError?: string; shortNameError?: string }) {
  const set = <K extends keyof GameTheme>(key: K, value: GameTheme[K]) => update((current) => ({ ...current, [key]: value }));
  const setSecret = (id: keyof GameTheme["secrets"], value: Partial<SecretText>) =>
    update((current) => ({ ...current, secrets: { ...current.secrets, [id]: { ...current.secrets[id], ...value } } }));
  const trophies = Object.values(theme.secrets).map((secret) => secret.trophy);
  const totalPoints = trophies.reduce((sum, trophy) => sum + TROPHY_POINTS[trophy], 0);
  const counts = Object.fromEntries(TROPHIES.map((trophy) => [trophy, trophies.filter((item) => item === trophy).length])) as Record<(typeof TROPHIES)[number], number>;

  return (
    <>
      <section className="card" aria-labelledby="juegos-portada">
        <h2 id="juegos-portada" className="font-display text-title font-bold">
          Portada
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">Lo primero que se ve al abrir los juegos.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="tema-titulo-1" label="Nombre del juego, primer renglón" value={theme.title[0]} max={12} fallback={BASE.title[0]} onChange={(value) => set("title", [value, theme.title[1]])} />
          <TextField id="tema-titulo-2" label="Nombre del juego, segundo renglón" value={theme.title[1]} max={12} fallback={BASE.title[1]} onChange={(value) => set("title", [theme.title[0], value])} />
          <TextField id="tema-homenaje" label="Texto antes del usuario" value={theme.tribute} max={THEME_LIMITS.line} fallback={BASE.tribute} hint="Por ejemplo: “Un homenaje a”." onChange={(value) => set("tribute", value)} />
          <TextField id="tema-usuario" label="Usuario dedicado" value={theme.handle} max={THEME_LIMITS.line} fallback={BASE.handle} hint="Sale grande y dorado, tal cual lo escribas (sin enlace)." onChange={(value) => set("handle", value)} />
          <div className="sm:col-span-2">
            <TextField id="tema-dedicatoria" label="Dedicatoria" value={theme.dedication} max={120} fallback={BASE.dedication} onChange={(value) => set("dedication", value)} />
          </div>
        </div>
        <PixelPreview label="Así se ve la portada" className="mt-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <PixelText unit="u" size={2} bands={["#fffbe6", "#fff1b8", "#ffdc7c", "#ffbd4f", "#ff9547", "#f4683f", "#d9463c"]} outline={NIGHT} align="center" label="">
              {`${theme.title[0] || BASE.title[0]}\n${theme.title[1] || BASE.title[1]}`}
            </PixelText>
            <PixelText as="p" color="#c9c4e8" align="center" label="">
              {theme.tribute || BASE.tribute}
            </PixelText>
            <PixelText as="p" size={2} color="#ffd684" align="center" label="">
              {theme.handle || BASE.handle}
            </PixelText>
            <PixelText as="p" align="center" label="">
              {theme.dedication || BASE.dedication}
            </PixelText>
          </div>
        </PixelPreview>
      </section>

      <section className="card" aria-labelledby="juegos-nombre">
        <h2 id="juegos-nombre" className="font-display text-title font-bold">
          El nombre de los juegos
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          En varios juegos se junta un nombre letra por letra: en {GAME_NAMES.laberinto}, {GAME_NAMES.espiritus} (cada oleada dibuja una letra),{" "}
          {GAME_NAMES.tejados}, {GAME_NAMES.dragon}, {GAME_NAMES.carreras} y {GAME_NAMES.pinball}. También son las letras del {GAME_NAMES.muro} y las caras de las cartas de{" "}
          {GAME_NAMES.parejas} y {GAME_NAMES.fichas}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="tema-nombre"
            label={`Nombre que se junta (${NAME_MIN} a ${NAME_MAX} letras)`}
            value={theme.name}
            max={NAME_MAX}
            transform={lettersOnly(NAME_MAX)}
            inputClassName="uppercase"
            invalid={!!nameError}
            error={nameError}
            hint="Solo letras: sin espacios, números ni signos. Sirven las tildes y la Ñ."
            onChange={(value) => set("name", value)}
          />
          <TextField
            id="tema-nombre-corto"
            label="Nombre corto"
            value={theme.shortName}
            max={THEME_LIMITS.shortName}
            transform={lettersOnly(THEME_LIMITS.shortName)}
            inputClassName="uppercase"
            invalid={!!shortNameError}
            error={shortNameError}
            hint="Escribirlo con el teclado en la portada, o firmar un puntaje con él (o con el nombre completo), abre mensajes secretos."
            onChange={(value) => set("shortName", value)}
          />
        </div>
        <PixelPreview label="Las letras, una por una, como se juntan en los juegos" className="mt-4">
          {theme.name.length > 0 ? (
            <ol className="flex flex-wrap gap-2" aria-label={`Letras: ${[...theme.name].join(", ")}`}>
              {[...theme.name].map((letter, index) => (
                <li key={index} className="flex min-w-9 items-center justify-center rounded-[4px] border-2 border-[#ffd684] px-1.5 py-1.5" aria-hidden="true">
                  <PixelText size={1} unit="u" color="#ffd684" label="">
                    {letter}
                  </PixelText>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm">Escribe un nombre para verlo aquí.</p>
          )}
        </PixelPreview>
      </section>

      <section className="card" aria-labelledby="juegos-mensaje">
        <h2 id="juegos-mensaje" className="font-display text-title font-bold">
          El mensaje
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Aparece al completar 10 líneas en {GAME_NAMES.bloques}.
        </p>
        <div className="flex flex-col gap-4">
          <TextField id="tema-mensaje-titulo" label="Título del mensaje" value={theme.letterTitle} max={THEME_LIMITS.line} fallback={BASE.letterTitle} onChange={(value) => set("letterTitle", value)} />
          <ParagraphList id="tema-mensaje-parrafo" legend="Párrafos" paragraphs={theme.letter} max={THEME_LIMITS.paragraphs} onChange={(value) => set("letter", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="tema-firma" label="Firma" value={theme.signature} max={THEME_LIMITS.line} fallback={BASE.signature} onChange={(value) => set("signature", value)} />
            <TextField
              id="tema-lograste"
              label="Texto al ganar"
              value={theme.unlocked}
              max={THEME_LIMITS.line}
              fallback={BASE.unlocked}
              hint="Sale encima del mensaje cuando se gana jugando."
              onChange={(value) => set("unlocked", value)}
            />
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="juegos-secretos">
        <h2 id="juegos-secretos" className="font-display text-title font-bold">
          Mensajes secretos y logros
        </h2>
        <p className="mt-1 text-sm text-muted">
          Secretos dentro del secreto: cada uno se descubre de una manera distinta, y mientras tanto se ve su pista. Los descubiertos se pueden volver a leer desde la
          portada.
        </p>
        <p className="mt-2 text-sm">
          Cada mensaje secreto es un <strong>logro</strong> con su trofeo (bronce, plata u oro), y quien los consigue todos abre el{" "}
          <a href="#juegos-final" className="link">
            secreto final
          </a>
          .
        </p>
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-field bg-brand-tint px-3 py-2.5" aria-live="polite">
          <p className="font-semibold">
            <span className="font-display text-title tabular-nums">{totalPoints}</span> puntos de logro posibles
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm" aria-label="Trofeos por tipo">
            {[...TROPHIES].reverse().map((trophy) => (
              <li key={trophy} className="flex items-center gap-1.5">
                <TrophyIcon trophy={trophy} scale={2} />
                <span>
                  {counts[trophy]} de {TROPHY_NAMES[trophy].toLowerCase()} <span className="text-muted">({TROPHY_POINTS[trophy]} c/u)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="flex flex-col gap-2">
          {SECRETS.map((secret) => {
            const value = theme.secrets[secret.id];
            return (
              <li key={secret.id}>
                <details className="group rounded-field border border-line/40">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-field px-3 py-2">
                    <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    <TrophyIcon trophy={value.trophy} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{value.title || secret.title}</span>
                      <span className="block text-caption text-muted">Se descubre así: {hintFor(secret.hint, theme)}</span>
                    </span>
                    <span className="shrink-0 text-right text-caption">
                      <span className="block font-semibold">{TROPHY_NAMES[value.trophy]}</span>
                      <span className="block text-muted tabular-nums">{TROPHY_POINTS[value.trophy]} puntos</span>
                    </span>
                  </summary>
                  <div className="flex flex-col gap-4 border-t border-line/25 p-3">
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <TextField id={`tema-secreto-${secret.id}`} label="Título" value={value.title} max={THEME_LIMITS.line} fallback={secret.title} onChange={(title) => setSecret(secret.id, { title })} />
                      <fieldset>
                        <legend className="label">Trofeo del logro</legend>
                        <div className="flex gap-1.5">
                          {TROPHIES.map((trophy) => {
                            const selected = value.trophy === trophy;
                            return (
                              <label
                                key={trophy}
                                className={[
                                  "flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col items-center gap-1 rounded-field border px-2 py-1.5 text-center sm:flex-none sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-left",
                                  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                                  selected ? "border-brand bg-brand-tint ring-1 ring-brand" : "border-line bg-raised",
                                ].join(" ")}
                              >
                                <input
                                  type="radio"
                                  name={`tema-secreto-${secret.id}-trofeo`}
                                  id={`tema-secreto-${secret.id}-trofeo-${trophy}`}
                                  className="sr-only"
                                  checked={selected}
                                  onChange={() => setSecret(secret.id, { trophy })}
                                />
                                <TrophyIcon trophy={trophy} scale={2} />
                                <span className="text-sm leading-tight">
                                  <span className="block font-semibold">{TROPHY_NAMES[trophy]}</span>
                                  <span className="block text-caption whitespace-nowrap text-muted tabular-nums">{TROPHY_POINTS[trophy]} puntos</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </div>
                    <ParagraphList
                      id={`tema-secreto-${secret.id}-parrafo`}
                      legend="Párrafos"
                      paragraphs={value.text}
                      max={THEME_LIMITS.secretParagraphs}
                      onChange={(text) => setSecret(secret.id, { text })}
                    />
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
