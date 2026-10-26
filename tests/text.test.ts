import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { parseDatabaseUrl } from "../src/lib/database-url";
import { isEmail, readMultiline, readText } from "../src/lib/form";
import { findLockOwner } from "../src/lib/lock";
import {
  customerWhatsapp,
  formatWhatsapp,
  isValidWhatsapp,
  joinWhatsapp,
  splitWhatsapp,
  whatsappProblem,
} from "../src/lib/phone";
import { isUuid, isValidSlug, slugify } from "../src/lib/slug";

test("slugify: enlaces limpios a partir del nombre", () => {
  assert.equal(slugify("Pizzería Don Sebas"), "pizzeria-don-sebas");
  assert.equal(slugify("  Café Ñandú & Co. "), "cafe-nandu-co");
  assert.equal(slugify("Yo"), "yo-menu");
  assert.equal(slugify("¡¡!!"), "menu");
  assert.ok(slugify("x".repeat(80)).length <= 40);
  for (const name of ["Pizzería Don Sebas", "Yo", "¡¡!!", "a-----b", "x".repeat(80)]) {
    assert.ok(isValidSlug(slugify(name)), `slug inválido para "${name}"`);
  }
});

test("isValidSlug", () => {
  for (const good of ["demo", "el-antojo", "abc", "pizza-2"]) assert.ok(isValidSlug(good), good);
  for (const bad of ["", "ab", "-abc", "abc-", "Con Mayúsculas", "a--b", "ñandú", "x".repeat(41), "a/b"]) {
    assert.ok(!isValidSlug(bad), bad);
  }
});

test("isUuid", () => {
  assert.ok(isUuid("1a176448-5abd-4cf7-bebf-d57fbaaeee5f"));
  assert.ok(!isUuid("1a176448-5abd-4cf7-bebf-d57fbaaeee5f' or 1=1"));
  assert.ok(!isUuid(null));
});

test("WhatsApp: unir indicativo y número", () => {
  assert.equal(joinWhatsapp("57", "300 123 4567"), "573001234567");
  assert.equal(joinWhatsapp("593", "099 123 4567"), "593991234567"); // quita el cero inicial
  assert.equal(joinWhatsapp("", "+54 9 11 2233-4455"), "5491122334455");
  assert.equal(joinWhatsapp("57", ""), "");
});

test("WhatsApp: tolera el indicativo escrito dentro del número", () => {
  assert.equal(joinWhatsapp("57", "+57 300 123 4567"), "573001234567");
  assert.equal(joinWhatsapp("57", "0057 300 123 4567"), "573001234567");
  assert.equal(joinWhatsapp("57", "573001234567"), "573001234567"); // indicativo repetido
  assert.equal(joinWhatsapp("52", "+1 809 555 1234"), "18095551234"); // el "+" manda sobre el país elegido
  // Un número brasileño de la zona 55 no se confunde con un indicativo repetido.
  assert.equal(joinWhatsapp("55", "55 99123 4567"), "5555991234567");
});

test("WhatsApp: avisa de números con cifras de más o de menos", () => {
  assert.equal(whatsappProblem("573001234567"), null);
  assert.match(whatsappProblem("57300123456") ?? "", /Colombia.*10 cifras.*tiene 9/);
  assert.match(whatsappProblem("5730012345678") ?? "", /tiene 11/);
  assert.equal(whatsappProblem("51987654321"), null); // Perú, celular
  assert.equal(whatsappProblem("5112345678"), null); // Perú, fijo
  assert.equal(whatsappProblem("4915112345678"), null); // país sin regla propia
  assert.match(whatsappProblem("123") ?? "", /no parece válido/);
});

test("WhatsApp: separar, validar y mostrar", () => {
  assert.deepEqual(splitWhatsapp("573001234567"), { code: "57", local: "3001234567" });
  assert.deepEqual(splitWhatsapp("50761234567"), { code: "507", local: "61234567" });
  assert.deepEqual(splitWhatsapp("18095551234"), { code: "1", local: "8095551234" });
  assert.deepEqual(splitWhatsapp("4915112345678"), { code: "", local: "4915112345678" });
  assert.ok(isValidWhatsapp("573001234567"));
  assert.ok(!isValidWhatsapp("57300123"));
  assert.ok(!isValidWhatsapp("57"));
  assert.ok(!isValidWhatsapp("0573001234567"));
  assert.ok(!isValidWhatsapp("1234567890123456"));
  assert.equal(formatWhatsapp("573001234567"), "+57 300 123 4567");
  assert.equal(formatWhatsapp(""), "");
});

test("lectura de formularios", () => {
  const form = new FormData();
  form.set("name", "  Hamburguesa   clásica \n");
  form.set("list", "Efectivo\r\nNequi\r\n");
  assert.equal(readText(form, "name", 80), "Hamburguesa clásica");
  assert.equal(readText(form, "name", 5), "Hambu");
  assert.equal(readText(form, "missing", 10), "");
  assert.equal(readMultiline(form, "list", 100), "Efectivo\nNequi");
  assert.ok(isEmail("ana@correo.com"));
  for (const bad of ["ana", "ana@", "ana@correo", "a b@c.com", ""]) assert.ok(!isEmail(bad), bad);
});

test("DATABASE_URL: cifrado según el servidor", () => {
  delete process.env.DATABASE_SSL;
  assert.deepEqual(parseDatabaseUrl("postgresql://u:p@localhost:5432/db").ssl, false);
  assert.deepEqual(parseDatabaseUrl("postgresql://u:p@db.example.com:6543/postgres").ssl, { rejectUnauthorized: false });
  const strict = parseDatabaseUrl("postgresql://u:p@db.example.com/postgres?sslmode=verify-full");
  assert.deepEqual(strict.ssl, { rejectUnauthorized: true });
  assert.ok(!strict.connectionString.includes("sslmode"));
  assert.deepEqual(parseDatabaseUrl("postgresql://u:p@db.example.com/postgres?sslmode=disable").ssl, false);
  assert.throws(() => parseDatabaseUrl("no es una url"), /DATABASE_URL/);
  assert.throws(() => parseDatabaseUrl("mysql://u:p@host/db"), /postgresql/);
});

test("marca de base de datos en uso", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comanda-lock-"));
  const lockFile = path.join(dir, "comanda.lock");
  assert.equal(findLockOwner(lockFile), null, "sin archivo: libre");

  // Otro proceso vivo (el padre de esta prueba) con marca reciente: ocupada.
  fs.writeFileSync(lockFile, String(process.ppid));
  assert.equal(findLockOwner(lockFile), process.ppid);

  // La misma marca, pero sin renovar hace un minuto: quedó de un cierre brusco.
  assert.equal(findLockOwner(lockFile, Date.now() + 60_000), null);

  // Un proceso que ya no existe.
  fs.writeFileSync(lockFile, "999999999");
  assert.equal(findLockOwner(lockFile), null);

  // La marca de este mismo proceso no lo bloquea.
  fs.writeFileSync(lockFile, String(process.pid));
  assert.equal(findLockOwner(lockFile), null);

  fs.rmSync(dir, { recursive: true });
});

test("teléfono del cliente para escribirle por WhatsApp", () => {
  // Sin indicativo: se usa el del país del negocio.
  assert.equal(customerWhatsapp("300 555 0101", "573001234567"), "573005550101");
  // Si ya lo escribió con indicativo, no se duplica.
  assert.equal(customerWhatsapp("+57 300 555 0101", "573001234567"), "573005550101");
  assert.equal(customerWhatsapp("57 300 555 0101", "573001234567"), "573005550101");
  assert.equal(customerWhatsapp("0034 612 345 678", "573001234567"), "34612345678");
  // Negocio sin número configurado: se deja tal cual.
  assert.equal(customerWhatsapp("300 555 0101", ""), "3005550101");
  // Teléfonos que no sirven.
  assert.equal(customerWhatsapp("12", "573001234567"), "");
  assert.equal(customerWhatsapp("", "573001234567"), "");
});
