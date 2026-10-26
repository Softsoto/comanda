import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "../src/lib/config";
import { readImageUpload } from "../src/lib/images";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

test("imágenes: sin archivo", async () => {
  assert.deepEqual(await readImageUpload(null), { kind: "none" });
  assert.deepEqual(await readImageUpload(""), { kind: "none" });
  assert.deepEqual(await readImageUpload(new File([], "vacio.png")), { kind: "none" });
});

test("imágenes: reconoce JPG, PNG y WebP por su contenido", async () => {
  for (const [bytes, mime] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]] as const) {
    // El nombre y el tipo declarados no importan: manda el contenido.
    const result = await readImageUpload(new File([bytes], "archivo.txt", { type: "text/plain" }));
    assert.equal(result.kind, "image");
    if (result.kind === "image") assert.equal(result.mime, mime);
  }
});

test("imágenes: rechaza lo que no es una imagen aunque diga serlo", async () => {
  for (const content of ["<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "<html><script>alert(1)</script>", "GIF89a…"]) {
    const result = await readImageUpload(new File([content], "foto.png", { type: "image/png" }));
    assert.equal(result.kind, "error");
  }
});

test("imágenes: rechaza archivos demasiado grandes", async () => {
  const big = Buffer.concat([JPEG, Buffer.alloc(LIMITS.maxImageBytes)]);
  const result = await readImageUpload(new File([big], "grande.jpg"));
  assert.equal(result.kind, "error");
  if (result.kind === "error") assert.match(result.message, /2 MB/);
});
