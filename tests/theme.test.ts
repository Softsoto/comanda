import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanTheme, defaultTheme, SPRITE_SLOTS, unknownSigns, hintFor } from "../src/lib/game-theme";
import { GAME_NAME, shapeOf, lettersOf } from "../src/lib/game-name";
import { letterOf, createStars } from "../src/lib/stars";
import { NINJA as BIG_NINJA, NINJA_COLORS as BIG_COLORS } from "../src/components/secret/art";
import { CUSTOM, NAME, NINJA, NINJA_COLORS, SCARED_COLORS, SPIRIT_COLORS } from "../src/components/secret/games/kit";
import { applyTheme, currentTheme } from "../src/components/secret/theme";
import { faces as cardFaces } from "../src/components/secret/games/parejas";

const square = (size: number, char = "a") => Array.from({ length: size }, () => char.repeat(size));

test("personalización: sin nada, los valores de siempre", () => {
  const { theme, problems } = cleanTheme(null);
  assert.deepEqual(theme, defaultTheme());
  assert.deepEqual(problems, []);
  assert.equal(theme.name, "NATHALIA");
  assert.deepEqual(unknownSigns(theme), []);
});

test("personalización: limpia textos y nombre, y descarta lo que no sirve", () => {
  const { theme, problems } = cleanTheme({
    title: ["  Mis  ", "Juegos con un título larguísimo"],
    handle: "@ana\u0007",
    name: "lucía 2",
    shortName: "lu",
    letter: ["  Hola  ", "", 7, "Segundo"],
    secrets: { duelo: { title: "Ganaste", text: [] }, nada: { title: "x" } },
    sprites: { hero: { rows: square(12), colors: { a: "#ff0000" } }, heroSmall: { rows: square(7), colors: { a: "#ff0000" } }, car: { rows: square(16), colors: { a: "red" } } },
  });
  assert.deepEqual(theme.title, ["Mis", "Juegos con u"]);
  assert.equal(theme.handle, "@ana");
  assert.equal(theme.name, "LUCÍA");
  assert.equal(theme.shortName, "LU");
  assert.deepEqual(theme.letter, ["Hola", "Segundo"]);
  assert.equal(theme.secrets.duelo.title, "Ganaste");
  assert.deepEqual(theme.secrets.duelo.text, defaultTheme().secrets.duelo.text, "sin párrafos, quedan los de siempre");
  assert.ok(theme.sprites.hero && !theme.sprites.heroSmall && !theme.sprites.car);
  assert.equal(problems.length, 2, problems.join(" | "));
  assert.equal(cleanTheme({ name: "AB" }).theme.name, "NATHALIA");
  assert.equal(hintFor("Junta {nombre} aquí", theme), "Junta LUCÍA aquí");
});

test("personalización: cada espacio de dibujo tiene una medida razonable y única", () => {
  const ids = SPRITE_SLOTS.map((slot) => slot.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const slot of SPRITE_SLOTS) assert.ok(slot.width >= 4 && slot.width <= 32 && slot.height >= 4 && slot.height <= 32);
  // Un dibujo vacío o con un carácter sin color no sirve.
  assert.equal(cleanTheme({ sprites: { prizeSmall: { rows: square(5, "."), colors: { a: "#000000" } } } }).theme.sprites.prizeSmall, undefined);
  assert.equal(cleanTheme({ sprites: { prizeSmall: { rows: square(5, "b"), colors: { a: "#000000" } } } }).theme.sprites.prizeSmall, undefined);
});

test("personalización: al aplicarla cambian el nombre y los dibujos en todos lados, y se pueden volver a los originales", () => {
  const originalBig = [...BIG_NINJA.stand];
  const originalSmall = [...NINJA[0]];
  applyTheme({ name: "Sol", sprites: { hero: { rows: square(12, "q"), colors: { q: "#123456" } }, heroSmall: { rows: square(8, "q"), colors: { q: "#abcdef" } }, friendSmall: { rows: square(8, "z"), colors: { z: "#ffffff" } } } });
  assert.equal(GAME_NAME, "SOL");
  assert.equal(NAME, "SOL");
  assert.equal(letterOf(1), "O");
  assert.equal(createStars(1).foes.length, shapeOf("S").join("").split("#").length - 1);
  assert.deepEqual(lettersOf(), ["S", "O", "L"]);
  assert.deepEqual([...BIG_NINJA.run[0]], square(12, "q"));
  assert.deepEqual({ ...BIG_COLORS }, { q: "#123456" });
  assert.deepEqual([...NINJA[1]], square(8, "q"));
  assert.deepEqual({ ...NINJA_COLORS }, { q: "#abcdef" });
  assert.deepEqual({ ...SPIRIT_COLORS[2] }, { z: "#ffffff" });
  assert.deepEqual(Object.keys(SCARED_COLORS), ["z"]);
  assert.ok(CUSTOM.heroSmall && CUSTOM.friendSmall && !CUSTOM.car);
  assert.ok(cardFaces().some((face) => face.name === "letra S") && !cardFaces().some((face) => face.name === "letra N"));
  assert.equal(currentTheme().name, "SOL");

  applyTheme(null);
  assert.equal(NAME, "NATHALIA");
  assert.deepEqual([...BIG_NINJA.stand], originalBig);
  assert.deepEqual([...NINJA[0]], originalSmall);
  assert.ok(!CUSTOM.heroSmall);
  assert.ok(cardFaces().some((face) => face.name === "letra N"));
});
