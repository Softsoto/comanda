import assert from "node:assert/strict";
import { test } from "node:test";
import { FLOWER, GHOST, NINJA, TILES, WISP, type Sprite } from "../src/components/secret/art";
import { HUD_ABOVE, HUD_BESIDE, PAD, PAD_LEFT, PAD_RIGHT, TOP, arrange, letterSteps, titleSteps } from "../src/components/secret/layout";
import { ACCENT_ROWS, GLYPH_ROWS, drawWord, glyphFor, missingGlyphs, normalizeText } from "../src/components/secret/pixel-font";
import { ALL_TEXTS, HANDLE, LETTER, SIGNATURE } from "../src/components/secret/texts";
import { LANTERN, STONE_LANTERN, STREAMER, TALISMAN, WORLD_NAMES } from "../src/components/secret/worlds";
import { KINDS } from "../src/lib/blocks";

/* ---------- Letras de píxeles ---------- */

test("letras: todos los textos del juego se pueden dibujar", () => {
  const everything = [...ALL_TEXTS, ...WORLD_NAMES, "0123456789/", "‖▶×♫↻⤓★←→↑↓"].join(" ");
  assert.deepEqual(missingGlyphs(everything), [], "hay signos que la tipografía no tiene");
  // Los nombres de las piezas del marcador y cualquier puntaje.
  assert.deepEqual(missingGlyphs("999999 10/10 Nivel 15"), []);
  // Un signo que no existe se detecta (y en pantalla sale como "?").
  assert.deepEqual(missingGlyphs("hola ☃"), ["☃"]);
});

test("letras: cada una mide 7 filas, y todas sus filas tienen el mismo ancho", () => {
  for (const char of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!¡?¿@-—_·'\"()/+#%=…♥←→↑↓‖▶×♫↻⤓★ÁÉÍÓÚÜÑ") {
    const glyph = glyphFor(char);
    assert.ok(glyph, `falta la letra ${char}`);
    assert.equal(glyph.rows.length, GLYPH_ROWS, `${char}: filas`);
    for (const row of glyph.rows) {
      assert.equal(row.length, glyph.width, `${char}: una fila tiene otro ancho`);
      assert.match(row, /^[#.]+$/, `${char}: solo "#" y "."`);
    }
    if (glyph.accent) {
      assert.equal(glyph.accent.length, ACCENT_ROWS);
      for (const row of glyph.accent) assert.ok(row.length <= glyph.width, `${char}: la tilde no cabe sobre la letra`);
    }
  }
  assert.equal(glyphFor("☃"), null);
});

test("letras: minúsculas, comillas curvas y tildes", () => {
  assert.equal(normalizeText("Conocí a “Natha” – 2026"), 'CONOCÍ A "NATHA" - 2026');
  // Una palabra mide la suma de sus letras más un píxel de separación entre ellas.
  const word = drawWord("NATHA", false);
  assert.equal(word.width, 5 * 5 + 4);
  assert.equal(word.height, GLYPH_ROWS);
  assert.ok(word.path.startsWith("M"));
  // Con tildes, la palabra reserva dos filas arriba y la tilde se pinta ahí.
  const accented = drawWord("CONOCÍ", true);
  assert.equal(accented.height, GLYPH_ROWS + ACCENT_ROWS);
  assert.match(accented.pathsByRow[0], /M\d+ 0h/, "la tilde va en la primera fila");
  assert.equal(drawWord("LÍNEAS", true).height, drawWord("PUNTOS", true).height, "con o sin tilde, misma altura");
  // Un signo desconocido no rompe nada: se dibuja el de interrogación.
  assert.equal(drawWord("☃", false).path, drawWord("?", false).path);
});

test("el mensaje: va dirigido a ella, firmado, y sin enlaces", () => {
  assert.equal(HANDLE, "@nathabermudez03");
  assert.ok(LETTER.length >= 3 && LETTER.every((paragraph) => paragraph.trim().length > 20));
  assert.match(LETTER.join(" "), /2026/);
  assert.match(SIGNATURE, /Sebas/);
  for (const text of ALL_TEXTS) assert.doesNotMatch(text, /https?:|www\.|instagram/i, "los textos no llevan enlaces");
});

/* ---------- Dibujos ---------- */

const rectangular = (name: string, sprite: Sprite, width: number, height: number) => {
  assert.equal(sprite.length, height, `${name}: alto`);
  sprite.forEach((row, index) => assert.equal(row.length, width, `${name}: fila ${index}`));
};

test("dibujos: cada muñequito y cada ficha tienen todas sus filas completas", () => {
  const ninja: [string, Sprite][] = [
    ["corriendo 1", NINJA.run[0]],
    ["corriendo 2", NINJA.run[1]],
    ["saltando", NINJA.jump],
    ["de pie", NINJA.stand],
  ];
  for (const [name, frame] of ninja) rectangular(`ninja ${name}`, frame, 12, 12);
  rectangular("espíritu", GHOST.open, 11, 12);
  rectangular("espíritu parpadeando", GHOST.blink, 11, 12);
  WISP.forEach((frame, index) => rectangular(`fuego ${index}`, frame, 7, 9));
  rectangular("flor", FLOWER, 11, 11);
  rectangular("farol", LANTERN, 5, 7);
  rectangular("farol de piedra", STONE_LANTERN, 11, 16);
  rectangular("amuleto", TALISMAN, 4, 7);
  STREAMER.forEach((frame, index) => rectangular(`tira de papel ${index}`, frame, 3, 6));

  // Una ficha por cada tipo de pieza, con colores distintos y su dibujito de 6 × 6.
  assert.deepEqual(Object.keys(TILES).sort(), [...KINDS].sort());
  assert.equal(new Set(Object.values(TILES).map((tile) => tile.base)).size, KINDS.length, "cada pieza, su color");
  for (const kind of KINDS) {
    rectangular(`ficha ${kind}`, TILES[kind].icon, 6, 6);
    for (const color of [TILES[kind].base, TILES[kind].light, TILES[kind].dark]) assert.match(color, /^#[0-9a-f]{6}$/);
  }
});

/* ---------- Acomodo en pantalla ---------- */

const SCREENS: [name: string, width: number, height: number, ratio: number, touch: boolean, mode: "retrato" | "lado"][] = [
  ["celular pequeño", 320, 568, 2, true, "retrato"],
  ["Android común", 360, 640, 3, true, "retrato"],
  ["Android alto", 360, 800, 3, true, "retrato"],
  ["iPhone SE", 375, 667, 2, true, "retrato"],
  ["iPhone", 390, 844, 3, true, "retrato"],
  ["iPhone grande", 430, 932, 3, true, "retrato"],
  ["Pixel", 412, 915, 2.625, true, "retrato"],
  ["celular acostado", 844, 390, 3, true, "lado"],
  ["celular pequeño acostado", 667, 375, 2, true, "lado"],
  ["tableta", 768, 1024, 2, true, "retrato"],
  ["tableta acostada", 1024, 768, 2, true, "lado"],
  ["ventana pequeña", 800, 600, 1, false, "lado"],
  ["portátil", 1366, 768, 1, false, "lado"],
  ["portátil con la pantalla ampliada", 1280, 720, 1.25, false, "lado"],
  ["escritorio", 1920, 1080, 1, false, "lado"],
  ["monitor grande", 2560, 1440, 1, false, "lado"],
  ["ventana angosta en el computador", 480, 900, 1, false, "retrato"],
];

test("acomodo: en cada pantalla el tablero cabe entero, nítido y a buen tamaño", () => {
  for (const [name, width, height, ratio, touch, mode] of SCREENS) {
    const layout = arrange(width, height, ratio, touch);
    assert.equal(layout.mode, mode, `${name}: orientación`);
    // Cada píxel del juego ocupa un número entero de píxeles de la pantalla.
    const devicePixels = layout.unit * ratio;
    assert.ok(Math.abs(devicePixels - Math.round(devicePixels)) < 1e-6, `${name}: píxeles nítidos (${devicePixels})`);
    // Fichas de 18 px o más: se ven bien y se distinguen los dibujos.
    assert.ok(layout.unit >= 1.5, `${name}: muy pequeño (${layout.unit})`);
    if (layout.mode === "retrato") {
      assert.ok(128 * layout.unit + 12 <= width + 1e-6, `${name}: ancho`);
      assert.ok(TOP + (224 + HUD_ABOVE) * layout.unit + (touch ? PAD : 10) <= height + 1e-6, `${name}: alto`);
    } else {
      assert.ok((128 + HUD_BESIDE) * layout.unit + 16 + (touch ? PAD_LEFT + PAD_RIGHT : 0) <= width + 1e-6, `${name}: ancho`);
      assert.ok(224 * layout.unit + 16 <= height + 1e-6, `${name}: alto`);
      assert.ok(layout.hudTop >= 0 && layout.hudTop <= TOP);
    }
  }
  // Una ventana diminuta no rompe nada: el píxel nunca baja de 1.
  assert.equal(arrange(200, 150, 1, false).unit, 1);
  // Al tocar la pantalla aparecen los botones y el tablero se achica para dejarles sitio.
  assert.ok(arrange(390, 700, 2, true).unit <= arrange(390, 700, 2, false).unit);
});

test("acomodo: la portada y el mensaje van de más grande a más pequeño hasta caber", () => {
  for (const [name, width, height, ratio, touch] of SCREENS) {
    const layout = arrange(width, height, ratio, touch);
    const steps = titleSteps(layout);
    assert.ok(steps.length >= 3, name);
    assert.deepEqual({ handle: steps[0].handle, notes: steps[0].notes }, { handle: 2, notes: 2 }, `${name}: empieza con todo`);
    assert.ok(steps[0].text >= 2 && steps[0].text === Math.max(layout.unit, 2), `${name}: textos al tamaño del juego`);
    for (let index = 1; index < steps.length; index++) {
      const [before, after] = [steps[index - 1], steps[index]];
      assert.ok(
        after.text <= before.text && after.logo <= before.logo && after.handle <= before.handle && after.notes <= before.notes,
        `${name}: el paso ${index} no puede crecer`,
      );
      assert.notDeepEqual(after, before, `${name}: el paso ${index} repite el anterior`);
    }
    const last = steps[steps.length - 1];
    assert.deepEqual(
      { text: last.text, logo: last.logo, handle: last.handle, notes: last.notes },
      { text: 2, logo: 2, handle: 1, notes: 0 },
      name,
    );

    const letter = letterSteps(layout.unit);
    assert.equal(letter[letter.length - 1], 2, `${name}: las letras del mensaje nunca bajan de 2 px`);
    assert.ok(letter[0] <= Math.max(2, layout.unit));
    assert.deepEqual(
      [...letter].sort((a, b) => b - a),
      letter,
    );
  }
});
