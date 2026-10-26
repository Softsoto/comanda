import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { revalidatePath } from "next/cache";
import packageInfo from "../../../../../package.json";
import { requireAdmin } from "@/lib/admin";
import { currentSessionHash } from "@/lib/auth";
import { BackupError, backupFileName, describeBackup, restoreBackup, writeBackup, type BackupSummary } from "@/lib/backup";
import { applySchema, isLocalDatabase, localDataDir, transaction } from "@/lib/db";
import { secureDemoAccount, type DemoAccountCheck } from "@/lib/demo-account";

export const dynamic = "force-dynamic";

const CONFIRM_WORD = "RESTAURAR";

const reply = (status: number, body: { ok: boolean; message: string }) => Response.json(body, { status });

/**
 * Restaura una copia de seguridad: REEMPLAZA todo lo que hay en la base por el
 * contenido del archivo. El archivo llega como cuerpo de la petición y se lee
 * a medida que llega, sin cargarlo entero en memoria.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();

  // Solo se acepta desde la propia app (no desde otra página) y con la palabra de confirmación.
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return reply(403, { ok: false, message: "La petición no viene de esta app." });
  }
  if (request.headers.get("x-comanda-confirmar") !== CONFIRM_WORD) {
    return reply(400, { ok: false, message: `Escribe ${CONFIRM_WORD} para confirmar.` });
  }
  if (!request.body) return reply(400, { ok: false, message: "Elige el archivo de la copia." });

  const sessionHash = await currentSessionHash();
  const dataDir = isLocalDatabase() ? localDataDir() : null;
  let saved = "";
  let restored: { summary: BackupSummary; demo: DemoAccountCheck };
  try {
    // En el computador o en un servidor propio, antes de reemplazar nada se
    // guarda una copia de lo que hay, por si la restauración fue un error.
    if (dataDir) {
      const folder = path.join(dataDir, "copias");
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, `antes-de-restaurar-${backupFileName().replace("comanda-copia-", "")}`);
      await transaction((query) => writeBackup(query, fs.createWriteStream(file), { app: packageInfo.version }));
      saved = path.join("data", "copias", path.basename(file));
    }

    const input = Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>);
    restored = await transaction(async (query) => {
      const summary = await restoreBackup(query, input);
      // Una copia de una versión anterior puede traer la cuenta de ejemplo con la
      // contraseña que era igual en todas las instalaciones: no se deja así.
      const demo = await secureDemoAccount(query, dataDir);
      // La sesión de quien restaura se conserva si su cuenta existe en la copia;
      // si no, tendrá que entrar con una cuenta de la copia.
      if (sessionHash) {
        await query(
          `insert into sessions (token_hash, user_id, expires_at)
           select $1, id, now() + interval '30 days' from users where email = $2`,
          [sessionHash, admin.email],
        );
      }
      return { summary, demo };
    });
    // Una copia de una versión anterior puede no traer columnas nuevas: se completan.
    await applySchema();
  } catch (error) {
    if (error instanceof BackupError) return reply(400, { ok: false, message: error.message });
    console.error("[copia] no se pudo restaurar:", error);
    return reply(500, {
      ok: false,
      message: "No se pudo restaurar la copia. La base de datos quedó como estaba. Revisa que el archivo sea el correcto.",
    });
  }

  revalidatePath("/", "layout");
  return reply(200, {
    ok: true,
    message:
      `Copia restaurada: ${describeBackup(restored.summary)}.` +
      (saved ? ` Lo que había antes quedó guardado en ${saved}.` : "") +
      (restored.demo === "renovada"
        ? " La cuenta de ejemplo de esa copia traía la contraseña conocida de versiones anteriores: se le puso una nueva, que está en el archivo data/cuenta-de-ejemplo.txt."
        : restored.demo === "desactivada"
          ? " La cuenta de ejemplo de esa copia traía la contraseña conocida de versiones anteriores y quedó sin contraseña: ponle una en su ficha si la necesitas."
          : ""),
  });
}
