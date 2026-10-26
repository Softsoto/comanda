import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_COLORS, PIXEL_CHARS, SPRITE_SLOTS, cleanSprite } from "../src/lib/game-theme";
import { OUTLINE_COLOR, artToImage, convertImage, cornerColor, hasTransparency, isBlankArt, quantize, removeBackground, resizeArt, trimTransparent, type RGBAImage } from "../src/lib/sprite-convert";
import { blankGrid, floodFill, freeChar, isBlank, lineCells, mirror, setPixel, shift, toArt, toEditable } from "../src/lib/sprite-edit";
import { GHOST, GHOST_COLORS, NINJA, NINJA_COLORS } from "../src/components/secret/art";

/** Una imagen de prueba: `paint(x, y)` dice el color [r, g, b, a] de cada píxel. */
function image(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number?]): RGBAImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint(x, y);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  return { width, height, data };
}

const hexes = (art: { colors: Record<string, string> }) => Object.values(art.colors).sort();

test("convertir: un dibujo de la medida exacta y pocos colores queda igual", () => {
  const source = artToImage({ rows: [...NINJA.stand], colors: { ...NINJA_COLORS } });
  const art = convertImage(source, { width: 12, height: 12, fit: "contain", background: "image", colors: 16 });
  // Mismos píxeles: cada carácter nuevo corresponde a un color original.
  const back = artToImage(art);
  assert.deepEqual([...back.data], [...source.data]);
  assert.ok(cleanSprite(art, 12, 12), "el resultado debe pasar la revisión del servidor");
});

test("convertir: el resultado siempre tiene la medida del espacio y caracteres válidos", () => {
  const photo = image(97, 61, (x, y) => [(x * 7) % 256, (y * 11) % 256, ((x + y) * 5) % 256]);
  for (const slot of SPRITE_SLOTS) {
    for (const fit of ["contain", "cover"] as const) {
      const art = convertImage(photo, { width: slot.width, height: slot.height, fit, background: "image", colors: 6, outline: fit === "contain" });
      assert.equal(art.rows.length, slot.height, `${slot.id} ${fit}: alto`);
      for (const row of art.rows) assert.equal(row.length, slot.width, `${slot.id} ${fit}: ancho`);
      assert.ok(Object.keys(art.colors).length <= 6, `${slot.id} ${fit}: colores`);
      for (const char of Object.keys(art.colors)) assert.ok(PIXEL_CHARS.includes(char));
      assert.ok(cleanSprite(art, slot.width, slot.height), `${slot.id} ${fit}: pasa la revisión`);
    }
  }
});

test("convertir: encajar entera deja márgenes transparentes; llenar recortando no", () => {
  // Una imagen ancha (2:1), roja y opaca.
  const wide = image(40, 20, () => [220, 30, 30]);
  const contain = convertImage(wide, { width: 12, height: 12, fit: "contain", background: "image", colors: 4 });
  assert.equal(contain.rows[0], "............", "arriba queda margen");
  assert.equal(contain.rows[11], "............", "abajo queda margen");
  assert.match(contain.rows[6], /^0{12}$/, "el centro está lleno de lado a lado");
  const cover = convertImage(wide, { width: 12, height: 12, fit: "cover", background: "image", colors: 4 });
  assert.ok(cover.rows.every((row) => /^0{12}$/.test(row)), "todo lleno");
});

test("convertir: la posición del recorte decide qué parte se ve", () => {
  // Mitad izquierda azul, mitad derecha amarilla.
  const halves = image(40, 10, (x) => (x < 20 ? [20, 40, 200] : [250, 220, 40]));
  const left = convertImage(halves, { width: 8, height: 8, fit: "cover", focusX: 0, background: "image", colors: 2 });
  const right = convertImage(halves, { width: 8, height: 8, fit: "cover", focusX: 1, background: "image", colors: 2 });
  assert.deepEqual(hexes(left), ["#1428c8"]);
  assert.deepEqual(hexes(right), ["#fadc28"]);
});

test("quitar fondo: el color de las esquinas se va, pero no lo del mismo color encerrado", () => {
  // Fondo blanco, un cuadrado verde con un "ojo" blanco en el centro.
  const picture = image(30, 30, (x, y) => {
    if (x >= 12 && x < 18 && y >= 12 && y < 18) return [255, 255, 255];
    if (x >= 6 && x < 24 && y >= 6 && y < 24) return [30, 160, 60];
    return [252, 252, 250];
  });
  assert.equal(hasTransparency(picture), false);
  assert.equal(cornerColor(picture), "#fcfcfa");
  const cleaned = removeBackground(picture, "#ffffff", 5);
  assert.equal(cleaned.data[3], 0, "la esquina quedó transparente");
  assert.equal(cleaned.data[(15 * 30 + 15) * 4 + 3], 255, "el ojo blanco sigue ahí");
  assert.ok(hasTransparency(cleaned));

  const art = convertImage(picture, { width: 10, height: 10, fit: "contain", background: "corners", tolerance: 5, colors: 4, trim: false });
  assert.equal(art.rows[0], "..........");
  assert.ok(hexes(art).includes("#ffffff"), "el blanco del ojo se conserva como color");
  assert.ok(hexes(art).some((hex) => hex.startsWith("#1e")), "el verde está");
  // Sin quitar el fondo, todo queda opaco.
  const kept = convertImage(picture, { width: 10, height: 10, fit: "contain", background: "image", colors: 4 });
  assert.ok(kept.rows.every((row) => !row.includes(".")));
});

test("bordes vacíos: se recortan para que la figura use todo el espacio", () => {
  // Un cuadrado pequeño en medio de una imagen grande y transparente.
  const small = image(40, 40, (x, y) => (x >= 15 && x < 25 && y >= 15 && y < 25 ? [40, 90, 200] : [0, 0, 0, 0]));
  assert.deepEqual(trimTransparent(small).width, 10);
  const trimmed = convertImage(small, { width: 8, height: 8, fit: "contain", background: "image", colors: 2 });
  assert.ok(trimmed.rows.every((row) => /^0{8}$/.test(row)), "lo llena todo");
  const kept = convertImage(small, { width: 8, height: 8, fit: "contain", background: "image", colors: 2, trim: false });
  assert.equal(kept.rows[0], "........", "sin recortar, conserva el margen");
  assert.match(kept.rows[4], /^\.{3}0{2}\.{3}$/);
  // Una imagen sin bordes vacíos, o toda transparente, queda igual.
  const full = image(3, 3, () => [1, 2, 3]);
  assert.equal(trimTransparent(full), full);
});

test("quitar fondo: la tolerancia decide qué tan parecido debe ser el color", () => {
  // Un degradado suave de gris en el fondo.
  const picture = image(20, 20, (x, y) => (x > 7 && x < 13 && y > 7 && y < 13 ? [200, 20, 20] : [200 + (x % 4) * 6, 200, 200]));
  const strict = removeBackground(picture, "#c8c8c8", 0);
  const loose = removeBackground(picture, "#c8c8c8", 15);
  const clear = (img: RGBAImage) => [...img.data].filter((_, i) => i % 4 === 3).filter((a) => a === 0).length;
  assert.ok(clear(loose) > clear(strict), "con más tolerancia se quita más");
  assert.equal(clear(loose), 400 - 25, "y solo el fondo");
});

test("colores: corte por mediana + k-medias encuentra los colores principales", () => {
  // Cuatro bloques de color con un poco de ruido.
  const base: [number, number, number][] = [
    [230, 40, 40],
    [40, 200, 70],
    [40, 60, 220],
    [250, 230, 90],
  ];
  const noisy = image(40, 40, (x, y) => {
    const [r, g, b] = base[(x < 20 ? 0 : 1) + (y < 20 ? 0 : 2)];
    const n = ((x * 13 + y * 7) % 9) - 4;
    return [r + n, g - n, b + n];
  });
  const art = convertImage(noisy, { width: 8, height: 8, fit: "contain", background: "image", colors: 4 });
  const found = hexes(art).map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  assert.equal(found.length, 4);
  for (const color of base) {
    const close = found.some((other) => other.every((value, i) => Math.abs(value - color[i]) <= 12));
    assert.ok(close, `falta un color parecido a ${color}`);
  }
  // Con 2 colores, nunca más de 2.
  assert.ok(Object.keys(convertImage(noisy, { width: 8, height: 8, fit: "contain", background: "image", colors: 2 }).colors).length <= 2);
  // Nunca más de MAX_COLORS, aunque se pidan más.
  const rainbow = image(64, 64, (x, y) => [x * 4, y * 4, (x * y) % 256]);
  assert.ok(Object.keys(convertImage(rainbow, { width: 16, height: 12, fit: "cover", background: "image", colors: 99 }).colors).length <= MAX_COLORS);
  assert.deepEqual(quantize([], 4), []);
});

test("colores: los bordes entre dos colores no crean tonos mezclados", () => {
  // Azul arriba y rojo abajo, con el cambio a mitad de un píxel del resultado.
  const split = image(30, 30, (_x, y) => (y < 14 ? [30, 40, 110] : [220, 60, 60]));
  const art = convertImage(split, { width: 8, height: 8, fit: "contain", background: "image", colors: 8 });
  assert.deepEqual(hexes(art), ["#1e286e", "#dc3c3c"]);
});

test("contorno: rodea la figura con el color oscuro y cuenta dentro del total", () => {
  const dot = image(10, 10, (x, y) => (x >= 3 && x < 7 && y >= 3 && y < 7 ? [255, 200, 0] : [0, 0, 0, 0]));
  const art = convertImage(dot, { width: 8, height: 8, fit: "contain", background: "image", colors: 2, outline: true });
  assert.ok(Object.values(art.colors).includes(OUTLINE_COLOR));
  assert.equal(Object.keys(art.colors).length, 2);
  const outlineChar = Object.entries(art.colors).find(([, hex]) => hex === OUTLINE_COLOR)![0];
  // Cada píxel de la figura tiene vecino; todo el anillo de alrededor es contorno.
  const fill = art.rows.findIndex((row) => /[^.]/.test(row));
  assert.ok(art.rows[fill].split("").every((char) => char === "." || char === outlineChar), "la primera fila pintada es contorno");
  assert.equal(art.rows[0][0], ".", "las esquinas siguen transparentes");
});

test("convertir: una imagen transparente da un dibujo vacío (que el panel no deja guardar)", () => {
  const empty = image(10, 10, () => [0, 0, 0, 0]);
  const art = convertImage(empty, { width: 8, height: 8, fit: "contain", background: "image", colors: 4 });
  assert.ok(isBlankArt(art));
  assert.equal(cleanSprite(art, 8, 8), null);
});

test("del grande al pequeño: medida nueva, sin colores nuevos y nítido", () => {
  const big = toEditable({ rows: GHOST.open, colors: GHOST_COLORS }, 11, 12);
  const art = toArt(big.grid, big.palette);
  const small = resizeArt(art, 8, 8);
  assert.equal(small.rows.length, 8);
  for (const row of small.rows) assert.equal(row.length, 8);
  for (const hex of Object.values(small.colors)) assert.ok(Object.values(art.colors).includes(hex), "solo colores del grande");
  assert.ok(!isBlankArt(small));
  assert.ok(cleanSprite(small, 8, 8));
  // Un dibujo que ya mide eso queda igual.
  const ninja = { rows: [...NINJA.stand], colors: { ...NINJA_COLORS } };
  assert.deepEqual(resizeArt(ninja, 12, 12), ninja);
});

test("editor: pintar, líneas, balde, espejo y mover", () => {
  let grid = blankGrid(5, 4);
  assert.ok(isBlank(grid));
  grid = setPixel(grid, 1, 1, "a");
  assert.deepEqual(grid, [".....", ".a...", ".....", "....."]);
  assert.equal(setPixel(grid, 9, 9, "a"), grid, "fuera del dibujo no cambia nada");
  assert.deepEqual(lineCells(0, 0, 3, 1), [
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
  ]);
  // El balde no cruza a otro color.
  const walls = ["..#..", "..#..", "..#..", "..#.."];
  assert.deepEqual(floodFill(walls, 0, 0, "b"), ["bb#..", "bb#..", "bb#..", "bb#.."]);
  assert.equal(floodFill(walls, 2, 0, "#"), walls);
  assert.deepEqual(mirror(["ab..."]), ["...ba"]);
  assert.deepEqual(shift(["ab", "cd"], 1, 0), [".a", ".c"]);
  assert.deepEqual(shift(["ab", "cd"], 0, -1), ["cd", ".."]);
});

test("editor: los originales con '#' se pueden editar y guardar", () => {
  const { grid, palette } = toEditable({ rows: GHOST.open, colors: GHOST_COLORS }, 11, 12);
  assert.ok(!grid.join("").includes("#"));
  for (const entry of palette) assert.ok(PIXEL_CHARS.includes(entry.char));
  const art = toArt(grid, palette);
  assert.ok(cleanSprite(art, 11, 12), "pasa la revisión del servidor");
  // Ajusta a otra medida recortando o rellenando.
  assert.equal(toEditable({ rows: ["ab"], colors: { a: "#000000", b: "#ffffff" } }, 3, 2).grid.join("|"), "ab.|...");
  // Colores libres hasta MAX_COLORS.
  const full = [...PIXEL_CHARS].slice(0, MAX_COLORS).map((char) => ({ char, hex: "#000000" }));
  assert.equal(freeChar(full), null);
  assert.equal(freeChar(full.slice(1)), "0");
  // Al guardar, solo los colores usados.
  assert.deepEqual(toArt(["0."], [{ char: "0", hex: "#111111" }, { char: "1", hex: "#222222" }]).colors, { "0": "#111111" });
});

test("convertidor: un dibujo de píxeles ya a la medida se copia tal cual, con todos sus colores", () => {
  const width = 8;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  // 12 colores distintos en una franja, y el resto transparente.
  for (let i = 0; i < 12; i++) data.set([i * 20, 255 - i * 15, (i * 37) % 255, 255], (8 + i) * 4);
  const image = { width, height, data };
  const art = convertImage(image, { width, height, fit: "contain", focusX: 0.5, focusY: 0.5, background: "image", tolerance: 12, colors: 16, outline: false, trim: true });
  assert.equal(Object.keys(art.colors).length, 12);
  assert.equal(art.rows[0], "........");
  assert.equal(art.rows[1].includes("."), false);
  for (let i = 0; i < 12; i++) {
    const char = (i < 8 ? art.rows[1] : art.rows[2])[i % 8];
    const hex = art.colors[char];
    const n = parseInt(hex.slice(1), 16);
    assert.deepEqual([n >> 16, (n >> 8) & 255, n & 255], [i * 20, 255 - i * 15, (i * 37) % 255]);
  }
});
