import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEMO_EMAIL } from "../src/lib/config";
import {
  DEMO_PASSWORD_FILE,
  newDemoPassword,
  readDemoPasswordFile,
  secureDemoAccount,
  writeDemoPasswordFile,
} from "../src/lib/demo-account";
import { LEGACY_DEMO_PASSWORD, hashPassword, passwordProblem, verifyPassword } from "../src/lib/password";

/** Una "base de datos" mínima en memoria: solo lo que usa la revisión de la cuenta de ejemplo. */
function fakeDatabase(user: { id: string; password_hash: string } | null) {
  const state = { user, checked: null as string | null, sessionsDeleted: 0 };
  const query = async <T>(text: string, params: unknown[] = []): Promise<T[]> => {
    if (/^\s*select/i.test(text)) {
      assert.equal(params[0], DEMO_EMAIL);
      return (state.user ? [{ ...state.user, checked: state.checked }] : []) as T[];
    }
    if (/update users set password_hash/i.test(text)) {
      (state.user as { password_hash: string }).password_hash = params[1] as string;
      return [];
    }
    if (/delete from sessions/i.test(text)) {
      state.sessionsDeleted += 1;
      return [];
    }
    if (/insert into settings/i.test(text)) {
      state.checked = params[1] as string;
      return [];
    }
    throw new Error(`consulta inesperada: ${text}`);
  };
  return { state, query };
}

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "comanda-prueba-"));

test("contraseñas que nadie puede elegir", () => {
  assert.match(passwordProblem("corta") ?? "", /al menos 8 caracteres/);
  assert.match(passwordProblem("x".repeat(201)) ?? "", /demasiado larga/);
  assert.match(passwordProblem(LEGACY_DEMO_PASSWORD) ?? "", /cualquiera la conoce/);
  assert.equal(passwordProblem("una-clave-buena"), null);
  assert.match(passwordProblem("corta", "La contraseña nueva") ?? "", /^La contraseña nueva debe/);
});

test("la contraseña de la cuenta de ejemplo es distinta cada vez y fácil de copiar", () => {
  const passwords = new Set(Array.from({ length: 50 }, () => newDemoPassword()));
  assert.equal(passwords.size, 50);
  for (const password of passwords) {
    assert.match(password, /^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/, "sin 0, 1, i, l ni o, que se confunden");
    assert.equal(passwordProblem(password), null);
  }
});

test("el archivo de la cuenta de ejemplo se escribe y se vuelve a leer", () => {
  const dir = tempDir();
  assert.equal(readDemoPasswordFile(dir), null);
  assert.ok(writeDemoPasswordFile(dir, "abcd-2345"));
  assert.equal(readDemoPasswordFile(dir), "abcd-2345");
  assert.ok(fs.readFileSync(path.join(dir, DEMO_PASSWORD_FILE), "utf8").includes(DEMO_EMAIL));
});

test("una cuenta de ejemplo con la contraseña conocida recibe una nueva (base local)", async () => {
  const dir = tempDir();
  const db = fakeDatabase({ id: "u1", password_hash: await hashPassword(LEGACY_DEMO_PASSWORD) });
  assert.equal(await secureDemoAccount(db.query, dir), "renovada");
  const written = readDemoPasswordFile(dir);
  assert.ok(written && written !== LEGACY_DEMO_PASSWORD);
  const hash = (db.state.user as { password_hash: string }).password_hash;
  assert.ok(await verifyPassword(written, hash), "la del archivo es la de la cuenta");
  assert.ok(!(await verifyPassword(LEGACY_DEMO_PASSWORD, hash)), "la conocida ya no sirve");
  assert.equal(db.state.sessionsDeleted, 1, "se cierran las sesiones abiertas con la contraseña conocida");
  // La segunda vez no hay nada que cambiar, y el archivo sigue ahí.
  assert.equal(await secureDemoAccount(db.query, dir), "ok");
  assert.equal(readDemoPasswordFile(dir), written);
  assert.equal(db.state.sessionsDeleted, 1);
});

test("en la nube (sin carpeta de datos) esa cuenta queda sin contraseña", async () => {
  const db = fakeDatabase({ id: "u1", password_hash: await hashPassword(LEGACY_DEMO_PASSWORD) });
  assert.equal(await secureDemoAccount(db.query, null), "desactivada");
  assert.equal((db.state.user as { password_hash: string }).password_hash, "!");
  assert.equal(await secureDemoAccount(db.query, null), "ok");
});

test("si alguien cambió la contraseña, el archivo viejo se borra; si coincide, se conserva", async () => {
  const dir = tempDir();
  const db = fakeDatabase({ id: "u1", password_hash: await hashPassword("la-que-eligio-el-dueno") });
  writeDemoPasswordFile(dir, "abcd-2345");
  assert.equal(await secureDemoAccount(db.query, dir), "ok");
  assert.equal(readDemoPasswordFile(dir), null);

  const same = fakeDatabase({ id: "u2", password_hash: await hashPassword("wxyz-6789") });
  writeDemoPasswordFile(dir, "wxyz-6789");
  assert.equal(await secureDemoAccount(same.query, dir), "ok");
  assert.equal(readDemoPasswordFile(dir), "wxyz-6789");
});

test("sin cuenta de ejemplo no queda ningún archivo", async () => {
  const dir = tempDir();
  writeDemoPasswordFile(dir, "abcd-2345");
  assert.equal(await secureDemoAccount(fakeDatabase(null).query, dir), "ok");
  assert.equal(readDemoPasswordFile(dir), null);
});
