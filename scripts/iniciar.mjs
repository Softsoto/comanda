#!/usr/bin/env node
/**
 * Arranca Comanda en este computador.
 *
 *   node scripts/iniciar.mjs          modo normal (rápido, para probar y usar)
 *   node scripts/iniciar.mjs --dev    modo desarrollo (recarga sola al cambiar el código)
 *   node scripts/iniciar.mjs --no-abrir   no abre el navegador
 *   node scripts/iniciar.mjs --solo-local no la comparte con otros dispositivos de la red
 *
 * Hace solo lo que falte: instala las dependencias la primera vez, prepara la
 * app si el código cambió, busca un puerto libre y abre el navegador.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const args = process.argv.slice(2);
const devMode = args.includes("--dev");
const openBrowser = !args.includes("--no-abrir") && !process.env.CI;
const host = args.includes("--solo-local") ? "127.0.0.1" : "0.0.0.0";
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };

const startedAt = Date.now();

/**
 * Valor de un ajuste: del entorno o de .env.local / .env. Next lee esos
 * archivos por su cuenta; aquí solo hacen falta para mostrar los datos
 * correctos en pantalla.
 */
function setting(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [".env.local", ".env"]) {
    try {
      const match = new RegExp(`^\\s*${name}\\s*=\\s*(\\S.*?)\\s*$`, "m").exec(fs.readFileSync(path.join(root, file), "utf8"));
      if (match) return match[1].replace(/^["']|["']$/g, "");
    } catch {
      // Ese archivo no existe.
    }
  }
  return "";
}
const isConfigured = (name) => setting(name) !== "";

// Carpeta de la base local. Si ya había una base de antes, al final se avisa
// cuando su cuenta de ejemplo cambió de contraseña.
const dataDir = path.resolve(root, setting("DATA_DIR") || "data");
const hadDatabase = fs.existsSync(path.join(dataDir, "pgdata"));

const say = (text = "") => console.log(text);
function fail(text) {
  console.error(`\n  ERROR: ${text}\n`);
  process.exit(1);
}

/* 1. Versión de Node */
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  fail(
    `Tienes Node.js ${process.versions.node} y se necesita la versión 20.9 o más reciente.\n` +
      "    Descarga la versión LTS en https://nodejs.org, instálala y vuelve a intentar.",
  );
}

/* 1b. ¿Ya está abierta desde esta carpeta? Entonces no se instala ni se prepara nada debajo de ella. */
function isFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}
/** Lo que responde una copia de Comanda en ese puerto: la marca de su carpeta, o "" si ahí no hay ninguna. */
async function comandaAt(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/entrar`, { signal: AbortSignal.timeout(2000) });
    return response.headers.get("x-comanda") ?? "";
  } catch {
    return "";
  }
}
/** True si la base local de esta carpeta la tiene abierta otro proceso (misma regla que src/lib/lock.ts). */
function localDatabaseInUse() {
  try {
    const lockFile = path.join(dataDir, "comanda.lock");
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0 || Date.now() - fs.statSync(lockFile).mtimeMs > 20_000) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM";
    }
  } catch {
    return false; // no hay marca
  }
}
function openInBrowser(url) {
  if (!openBrowser) return;
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    spawn(command[0], command[1], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // Sin navegador disponible: la dirección ya quedó escrita en pantalla.
  }
}

// Cada copia en marcha responde con una marca de su carpeta (la pone next.config.ts).
const folderMark = createHash("sha1").update(process.cwd()).digest("hex").slice(0, 12);
const basePort = Number(process.env.PORT) || 3000;
{
  const inUse = localDatabaseInUse();
  let runningAt = 0;
  for (let candidate = basePort; candidate < basePort + 20 && !runningAt; candidate++) {
    const mark = await comandaAt(candidate);
    // La misma carpeta, o (con la base de esta carpeta ocupada) una copia de una versión anterior, que no decía cuál era.
    if (mark === folderMark || (inUse && mark !== "")) runningAt = candidate;
  }
  if (runningAt || inUse) {
    say(
      runningAt
        ? `\n  Comanda ya está abierta en http://localhost:${runningAt}`
        : "\n  Comanda ya está abierta desde esta carpeta.",
    );
    say("  Para reiniciarla o actualizarla, cierra primero esa ventana y vuelve a abrir este archivo.\n");
    if (runningAt) openInBrowser(`http://localhost:${runningAt}`);
    process.exit(0);
  }
}

/* 2. Dependencias (la primera vez, o cuando una versión nueva las cambia) */
function missingDependencies() {
  try {
    const { dependencies = {}, devDependencies = {} } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return Object.keys({ ...dependencies, ...devDependencies }).filter(
      (name) => !fs.existsSync(path.join(root, "node_modules", name, "package.json")),
    );
  } catch {
    return ["package.json"];
  }
}

/** Huella del contenido de unos archivos o carpetas: cambia si cambia cualquiera de ellos. */
function fingerprint(items) {
  const hash = createHash("sha1");
  const visit = (target, name) => {
    let stats;
    try {
      stats = fs.statSync(target);
    } catch {
      return;
    }
    if (stats.isDirectory()) {
      for (const entry of fs.readdirSync(target).sort()) visit(path.join(target, entry), `${name}/${entry}`);
    } else {
      hash.update(`${name}\0`);
      hash.update(fs.readFileSync(target));
      hash.update("\0");
    }
  };
  for (const item of items) visit(path.join(root, item), item);
  return hash.digest("hex");
}
const readMark = (file) => {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
};

// Se anota con qué lista de componentes se instaló. Si una versión nueva la cambia
// (aunque solo sea el número de versión de uno), se instala de nuevo.
const installMark = path.join(root, "node_modules", ".comanda-instalado");
const installPrint = fingerprint(["package.json", "package-lock.json"]);
const firstInstall = !fs.existsSync(nextBin);
if (firstInstall || missingDependencies().length > 0 || readMark(installMark) !== installPrint) {
  say(
    firstInstall
      ? "\n  Instalando lo necesario. Solo pasa la primera vez y puede tardar unos minutos…\n"
      : "\n  Revisando los componentes de esta versión…\n",
  );
  // --loglevel=error: oculta avisos de rutina que no afectan a la app.
  const result = spawnSync("npm install --no-audit --no-fund --loglevel=error", { stdio: "inherit", shell: true, env });
  if (result.status !== 0 || !fs.existsSync(nextBin) || missingDependencies().length > 0) {
    fail("No se pudieron instalar las dependencias. Revisa tu conexión a internet y vuelve a intentar.");
  }
  try {
    fs.writeFileSync(installMark, `${installPrint}\n`);
  } catch {
    // Sin la marca, la próxima vez se revisa de nuevo: tarda unos segundos más, nada grave.
  }
}

/* 3. Preparar la app si es la primera vez o si el código cambió */
if (!devMode) {
  // Se compara el contenido, no la fecha de los archivos: al descomprimir una versión nueva
  // encima de la anterior, los archivos conservan su fecha original, que puede ser más vieja
  // que la última vez que se preparó la app.
  const buildMarker = path.join(root, ".next", "BUILD_ID");
  const buildMark = path.join(root, ".next", "comanda-preparado");
  const sources = ["src", "public", "package.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json"];
  const sourcePrint = fingerprint(sources);
  const built = fs.existsSync(buildMarker);
  if (!built || readMark(buildMark) !== sourcePrint) {
    say(built ? "\n  El código cambió: preparando la app de nuevo…\n" : "\n  Preparando la app (tarda cerca de un minuto)…\n");
    const result = spawnSync(process.execPath, [nextBin, "build"], { stdio: "inherit", env });
    if (result.status !== 0) fail("La app no se pudo preparar. El error está en las líneas de arriba.");
    try {
      fs.writeFileSync(buildMark, `${sourcePrint}\n`);
    } catch {
      // Sin la marca, la próxima vez se prepara de nuevo.
    }
  }
}

/* 4. Puerto libre (el primero desde el 3000; otro programa pudo ocuparlo mientras se preparaba la app) */
let port = basePort;
for (let attempt = 0; attempt < 20 && !(await isFree(port)); attempt++) port += 1;

/* 5. Arrancar el servidor */
const server = spawn(process.execPath, [nextBin, devMode ? "dev" : "start", "-H", host, "-p", String(port)], {
  // En modo normal se ocultan los avisos de rutina del servidor; los errores sí se muestran.
  stdio: ["inherit", devMode ? "inherit" : "ignore", "inherit"],
  env,
});
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

/* 6. Esperar a que responda (la primera vez crea la base de datos y el menú de ejemplo) */
const localUrl = `http://localhost:${port}`;
say("\n  Arrancando…");
let ready = false;
for (let attempt = 0; attempt < 240 && !ready; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(60_000) });
    ready = response.ok;
    if (!ready && response.status >= 500 && attempt > 4) break;
  } catch {
    // Todavía no responde.
  }
  if (!ready) await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!ready) {
  server.kill();
  fail("La app no respondió. Revisa los mensajes de arriba; si usas DATABASE_URL, comprueba que sea correcta.");
}

// ¿Base local o en la nube?
const usesCloudDatabase = isConfigured("DATABASE_URL");
// Sin ADMIN_EMAILS, en local la cuenta de ejemplo administra el servicio.
const demoIsAdmin = !usesCloudDatabase && !isConfigured("ADMIN_EMAILS");

// La contraseña de la cuenta de ejemplo es propia de cada instalación: la app la
// deja escrita en un archivo de la carpeta de datos (ver src/lib/demo-account.ts).
const demoFile = path.join(dataDir, "cuenta-de-ejemplo.txt");
let demoPassword = "";
let demoPasswordIsNew = false;
try {
  demoPassword = /^Contraseña:\s*(\S+)/m.exec(fs.readFileSync(demoFile, "utf8"))?.[1] ?? "";
  // Recién escrita sobre una base que ya existía: venía de una versión anterior.
  // (Con dos segundos de margen: algunos discos redondean la hora de los archivos.)
  demoPasswordIsNew = hadDatabase && fs.statSync(demoFile).mtimeMs >= startedAt - 2000;
} catch {
  // Sin archivo: la contraseña la cambió quien usa la app, o no hay cuenta de ejemplo.
}
let hasDemoMenu = false;
try {
  hasDemoMenu = (await fetch(`http://127.0.0.1:${port}/m/demo`, { signal: AbortSignal.timeout(15_000) })).ok;
} catch {
  // Sin menú de ejemplo.
}

const networkUrls =
  host === "127.0.0.1"
    ? []
    : Object.values(os.networkInterfaces())
        .flat()
        .filter((item) => item && item.family === "IPv4" && !item.internal)
        .map((item) => `http://${item.address}:${port}`);

const showDemo = hasDemoMenu && !usesCloudDatabase;
const lines = [
  "",
  "  ┌──────────────────────────────────────────────────────────────┐",
  "  │  Comanda está funcionando                                    │",
  "  └──────────────────────────────────────────────────────────────┘",
  "",
  `  En este computador:   ${localUrl}`,
  ...(hasDemoMenu ? [`  Menú de ejemplo:      ${localUrl}/m/demo`] : []),
  `  Panel del negocio:    ${localUrl}/entrar`,
  ...(showDemo ? [`  Cuenta de ejemplo:    demo@comanda.test  /  ${demoPassword || "(la contraseña que le pusiste)"}`] : []),
  ...(showDemo && demoIsAdmin ? [`  Administración:       ${localUrl}/admin  (con la cuenta de ejemplo)`] : []),
  `  Base de datos:        ${usesCloudDatabase ? "PostgreSQL (DATABASE_URL)" : "local, en la carpeta data"}`,
  ...(showDemo && demoPassword
    ? [
        "",
        "  La contraseña de la cuenta de ejemplo es solo de esta instalación.",
        `  También está en el archivo: ${demoFile}`,
        ...(demoPasswordIsNew
          ? ["  Es nueva: la de versiones anteriores (demo1234) era igual para todos y ya no sirve."]
          : []),
      ]
    : []),
  ...(networkUrls.length
    ? ["", "  Desde tu celular (conectado a la misma red wifi):", ...networkUrls.map((url) => `    ${url}`)]
    : []),
  "",
  "  Para apagarla: cierra esta ventana o pulsa Ctrl + C.",
  "",
];
say(lines.join("\n"));

openInBrowser(localUrl);
