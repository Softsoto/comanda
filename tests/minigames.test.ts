import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { MINI_GAMES } from "../src/components/secret/games";
import { HEIGHT, WIDTH } from "../src/components/secret/games/kit";
import { noInput, quietOut, type Key } from "../src/components/secret/games/types";
import { missingGlyphs } from "../src/components/secret/pixel-font";
import { GAME_NAMES, SECRETS } from "../src/components/secret/texts";
import { WORLD_COUNT, WORLD_NAMES } from "../src/components/secret/worlds";
import { GAMES } from "../src/lib/scores";

/** Un lienzo de mentira: cuenta lo que se pinta y anota lo que tenga medidas rotas. */
function fakeCanvas() {
  const broken: string[] = [];
  const counter = { rects: 0 };
  const c = new Proxy(
    {
      fillRect(x: number, y: number, w: number, h: number) {
        counter.rects += 1;
        if (![x, y, w, h].every(Number.isFinite)) broken.push(`${x},${y},${w},${h}`);
      },
    } as Record<string, unknown>,
    {
      get: (target, key) => (key in target ? target[key as string] : typeof key === "string" && /^[a-z]/.test(key) ? () => ({ addColorStop() {} }) : undefined),
      set: () => true,
    },
  );
  return { c: c as unknown as CanvasRenderingContext2D, broken, counter };
}

test("juegos: cada juego del menú tiene nombre, tabla y (menos Torre de Luna) su archivo", () => {
  for (const id of GAMES) assert.ok(GAME_NAMES[id], id);
  assert.deepEqual(Object.keys(MINI_GAMES).sort(), GAMES.filter((id) => id !== "bloques").sort());
  assert.equal(WORLD_COUNT, 6);
  assert.equal(WORLD_NAMES.length, 6);
});

test("juegos: cada juego pequeño tiene su mensaje secreto, y los mensajes tienen pista y texto", () => {
  const ids = SECRETS.map((secret) => secret.id);
  assert.equal(new Set(ids).size, ids.length, "ids repetidos");
  for (const id of Object.keys(MINI_GAMES)) assert.ok(ids.includes(id as never), `falta el secreto de ${id}`);
  for (const secret of SECRETS) {
    assert.ok(secret.title && secret.hint && secret.text.length > 0);
    assert.deepEqual(missingGlyphs([secret.title, secret.hint.replaceAll("{nombre}", "ANA"), ...secret.text].join(" ")), []);
  }
});

test("juegos: todos arrancan, se juegan un rato con controles al azar, se dibujan sin medidas rotas y cumplen el contrato", () => {
  const keys: Key[] = ["left", "right", "up", "down", "fire"];
  for (const [id, def] of Object.entries(MINI_GAMES)) {
    for (const mode of def.twoPlayers ? ["1", "2"] : ["1"]) {
      const state = def.create(42, mode);
      const { c, broken, counter } = fakeCanvas();
      let most = 0;
      const log: string[] = [];
      let random = 99;
      const next = () => (random = (random * 1103515245 + 12345) >>> 0) / 4294967296;
      const held = new Set<Key>();
      let worlds = new Set<number>();
      for (let frame = 0; frame < 60 * 90; frame++) {
        const pressed: Key[] = [];
        if (frame % 15 === 0) {
          const key = keys[Math.floor(next() * keys.length)];
          if (held.has(key)) held.delete(key);
          else {
            held.add(key);
            pressed.push(key);
          }
        }
        const tap = frame % 23 === 0 ? [{ x: next() * WIDTH, y: next() * HEIGHT }] : [];
        def.step(state, next() * 0.05, noInput({ held, pressed, taps: tap, touches: frame % 200 < 60 ? tap : [] }), quietOut(log));
        const status = def.status(state);
        assert.ok(Number.isInteger(status.score) && status.score >= 0 && status.score <= 999_999, `${id}: puntaje ${status.score}`);
        assert.ok(status.world >= 0 && status.world < WORLD_COUNT, `${id}: mundo ${status.world}`);
        assert.ok(status.letters >= 0 && status.letters <= 8, `${id}: letras ${status.letters}`);
        worlds = worlds.add(status.world);
        if (frame % 30 === 0) {
          counter.rects = 0;
          def.draw(c, state, frame / 60, frame % 60 === 0);
          most = Math.max(most, counter.rects);
        }
        if (status.over) break;
      }
      assert.deepEqual(broken.slice(0, 3), [], `${id}: pinta con medidas rotas`);
      // Cada cuadro se pinta unas 60 veces por segundo: con demasiados rectángulos, el celular sufre.
      assert.ok(most < 9000, `${id}: ${most} rectángulos en un cuadro`);
      assert.ok(log.filter((line) => line === "secret").length <= 1, `${id}: el secreto se avisó más de una vez`);
      assert.ok(def.help.length > 10, `${id}: falta la ayuda`);
      const pad = def.pad(mode);
      assert.equal(pad.length, 2, `${id}: el teclado táctil va en dos grupos`);
      for (const button of pad.flat()) assert.ok(button.label && missingGlyphs(button.glyph).length === 0, `${id}: botón ${button.label}`);
    }
  }
});

test("juegos: todo lo que escriben en pantalla se puede dibujar con las letras de píxeles", () => {
  const folder = "src/components/secret/games";
  for (const file of fs.readdirSync(folder)) {
    const source = fs.readFileSync(`${folder}/${file}`, "utf8");
    // Los textos que se pasan a write/center/outlined (y los textos sueltos en mayúsculas).
    const texts = [...source.matchAll(/(?:write|center|outlined)\(\s*c,\s*["`]([^"`]+)["`]/g), ...source.matchAll(/["`]([A-ZÁÉÍÓÚÑ¡¿][A-ZÁÉÍÓÚÑ0-9 ¡!¿?.,:+·-]{2,})["`]/g)].map((match) => match[1].replace(/\$\{[^}]*\}/g, ""));
    assert.deepEqual(missingGlyphs(texts.join(" ")), [], `${file}: hay signos sin letra`);
  }
});
