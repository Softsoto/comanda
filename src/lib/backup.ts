import { once } from "node:events";
import { pipeline, type Readable, type Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { createGunzip, createGzip } from "node:zlib";

/**
 * Copia de seguridad de toda la base de datos en un solo archivo.
 *
 * El archivo es texto comprimido (gzip): una línea con los datos de la copia
 * y luego una línea por cada fila de cada tabla. Las fotos viajan dentro. Se
 * puede restaurar en la base local o en un PostgreSQL en la nube, y también
 * sirve para mudarse de una a otra.
 *
 * Este módulo no abre la base: recibe la función de consulta. Así lo usan
 * tanto la app (administración) como los comandos de consola.
 */

export type BackupQuery = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

/**
 * Tablas que entran en la copia, en el orden en que deben restaurarse: primero
 * las que otras necesitan. Las sesiones abiertas y los enlaces para
 * restablecer contraseñas no se copian.
 */
export const BACKUP_TABLES = [
  "users",
  "plans",
  "businesses",
  "images",
  "categories",
  "products",
  "delivery_zones",
  "coupons",
  "banners",
  "orders",
  "order_items",
  "menu_visits",
  "payments",
  "settings",
  "game_scores",
  "game_code_uses",
] as const;

/** Tablas sin columna "id": se leen de una sola vez. */
const WITHOUT_ID = new Set<string>(["menu_visits", "settings"]);
/**
 * Tablas de los juegos escondidos (puntajes y códigos usados): su "id" es un
 * número que pone la base sola, así que se guardan sin él (de una sola vez, son
 * pocas filas) y al restaurar la base les pone números nuevos.
 */
const NUMBERED = new Set<string>(["game_scores", "game_code_uses"]);

/** Tablas que se vacían al restaurar (las de la copia más las que dependen de ellas). */
const TABLES_TO_CLEAR = [...BACKUP_TABLES, "sessions", "password_resets"];

export const BACKUP_FORMAT = 1;

export type BackupSummary = {
  /** Filas por tabla. */
  tables: Record<string, number>;
  /** Fecha en que se hizo la copia (solo al restaurar). */
  createdAt?: string;
};

/** Error que se le puede mostrar tal cual a la persona. */
export class BackupError extends Error {}

/**
 * Escribe la copia en `output`. Llamar dentro de una transacción, para que
 * todas las tablas se lean como estaban en el mismo instante.
 */
export async function writeBackup(query: BackupQuery, output: Writable, info: { app: string }): Promise<BackupSummary> {
  const gzip = createGzip({ level: 6 });
  const done = finished(pipeline(gzip, output, () => {}));
  const write = async (value: unknown) => {
    // Si el destino va más lento que la lectura, se espera en vez de acumular todo en memoria.
    if (!gzip.write(`${JSON.stringify(value)}\n`)) await once(gzip, "drain");
  };

  const tables: Record<string, number> = {};
  try {
    await write({ comanda: "copia", format: BACKUP_FORMAT, app: info.app, createdAt: new Date().toISOString() });
    for (const table of BACKUP_TABLES) {
      tables[table] = 0;
      if (WITHOUT_ID.has(table) || NUMBERED.has(table)) {
        const rows = await query<{ row: unknown }>(`select to_jsonb(t) ${NUMBERED.has(table) ? "- 'id'" : ""} as row from ${table} t`);
        for (const { row } of rows) await write({ t: table, r: row });
        tables[table] = rows.length;
        continue;
      }
      // Por páginas: las fotos pesan, y así nunca hay más de unas pocas en memoria.
      const pageSize = table === "images" ? 10 : 500;
      let last: string | null = null;
      for (;;) {
        const rows: { id: string; row: unknown }[] = await query<{ id: string; row: unknown }>(
          `select t.id::text as id, to_jsonb(t) as row from ${table} t
            ${last ? "where t.id > $1::uuid" : ""} order by t.id limit ${pageSize}`,
          last ? [last] : [],
        );
        for (const { row } of rows) await write({ t: table, r: row });
        tables[table] += rows.length;
        if (rows.length < pageSize) break;
        last = rows[rows.length - 1].id;
      }
    }
    await write({ end: true, tables });
  } catch (error) {
    gzip.destroy(error instanceof Error ? error : new Error(String(error)));
    await done.catch(() => {});
    throw error;
  }
  gzip.end();
  await done;
  return { tables };
}

/** Lee un archivo de copia línea por línea, sin cargarlo entero en memoria. */
async function* readLines(input: Readable): AsyncGenerator<string> {
  const gunzip = createGunzip();
  // pipeline: si falla la lectura o el archivo está dañado, el error llega a quien recorre las líneas.
  pipeline(input, gunzip, () => {});
  const decoder = new StringDecoder("utf8");
  let buffer = "";
  let scanned = 0;
  try {
    for await (const chunk of gunzip) {
      buffer += decoder.write(chunk as Buffer);
      for (;;) {
        const index = buffer.indexOf("\n", scanned);
        if (index < 0) {
          scanned = buffer.length;
          break;
        }
        yield buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        scanned = 0;
      }
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "";
    if (code.startsWith("Z_") || code === "ERR_STREAM_PREMATURE_CLOSE") {
      throw new BackupError("Ese archivo no es una copia de seguridad válida, o está dañado.");
    }
    throw error;
  }
  buffer += decoder.end();
  if (buffer.trim()) yield buffer;
}

/** Tope de cada tanda de filas que se inserta de una vez. */
const BATCH_ROWS = 200;
const BATCH_BYTES = 4 * 1024 * 1024;

/**
 * Reemplaza TODO el contenido de la base por el de la copia. Llamar dentro de
 * una transacción: si algo falla a mitad de camino, la base queda como estaba.
 */
export async function restoreBackup(query: BackupQuery, input: Readable): Promise<BackupSummary> {
  const known = new Set<string>(BACKUP_TABLES);
  const columnsOf = new Map<string, Set<string>>();
  const counts: Record<string, number> = {};
  let header: { createdAt?: string } | null = null;
  let finalCounts: Record<string, number> | null = null;

  let batchTable = "";
  let batch: Record<string, unknown>[] = [];
  let batchBytes = 0;

  async function flush() {
    if (batch.length === 0) return;
    let columns = columnsOf.get(batchTable);
    if (!columns) {
      const rows = await query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = current_schema() and table_name = $1",
        [batchTable],
      );
      columns = new Set(rows.map((row) => row.column_name));
      columnsOf.set(batchTable, columns);
    }
    // Solo las columnas que existen aquí y que trae la copia: una copia de una
    // versión anterior deja que las columnas nuevas tomen su valor por defecto.
    const present = Object.keys(batch[0]).filter((column) => (columns as Set<string>).has(column) && /^[a-z_][a-z0-9_]*$/.test(column));
    if (present.length > 0) {
      const list = present.map((column) => `"${column}"`).join(", ");
      await query(
        `insert into ${batchTable} (${list}) select ${list} from jsonb_populate_recordset(null::${batchTable}, $1::jsonb)`,
        [JSON.stringify(batch)],
      );
    }
    counts[batchTable] = (counts[batchTable] ?? 0) + batch.length;
    batch = [];
    batchBytes = 0;
  }

  for await (const line of readLines(input)) {
    if (!line.trim()) continue;
    let entry: { comanda?: string; format?: number; createdAt?: string; t?: string; r?: Record<string, unknown>; end?: boolean; tables?: Record<string, number> };
    try {
      entry = JSON.parse(line);
    } catch {
      throw new BackupError("Ese archivo no es una copia de seguridad válida, o está dañado.");
    }

    if (!header) {
      if (entry.comanda !== "copia" || typeof entry.format !== "number") {
        throw new BackupError("Ese archivo no es una copia de seguridad de esta app.");
      }
      if (entry.format > BACKUP_FORMAT) {
        throw new BackupError("Esa copia se hizo con una versión más nueva de la app. Actualiza la app y vuelve a intentar.");
      }
      header = { createdAt: entry.createdAt };
      // Recién aquí, con un archivo que sí es una copia, se vacía la base.
      await query(`truncate table ${TABLES_TO_CLEAR.join(", ")} cascade`);
      continue;
    }
    if (entry.end) {
      finalCounts = entry.tables ?? {};
      continue;
    }
    if (typeof entry.t !== "string" || !entry.r || typeof entry.r !== "object") continue;
    if (!known.has(entry.t)) continue; // tabla de una versión más nueva: se ignora

    if (entry.t !== batchTable) {
      await flush();
      batchTable = entry.t;
    }
    batch.push(entry.r);
    batchBytes += line.length;
    if (batch.length >= BATCH_ROWS || batchBytes >= BATCH_BYTES) await flush();
  }
  await flush();

  if (!header) throw new BackupError("Ese archivo está vacío o no es una copia de seguridad.");
  // Sin la línea final, el archivo llegó cortado: no se acepta una copia a medias.
  if (!finalCounts) throw new BackupError("La copia está incompleta (el archivo llegó cortado). No se cambió nada.");
  for (const [table, expected] of Object.entries(finalCounts)) {
    if (known.has(table) && (counts[table] ?? 0) !== expected) {
      throw new BackupError("La copia está incompleta o dañada. No se cambió nada.");
    }
  }
  return { tables: Object.fromEntries(BACKUP_TABLES.map((table) => [table, counts[table] ?? 0])), createdAt: header.createdAt };
}

/** "3 comercios, 120 pedidos, 45 productos…": lo más importante de una copia, para mostrarlo. */
export function describeBackup(summary: BackupSummary): string {
  const part = (table: string, one: string, many: string) => {
    const count = summary.tables[table] ?? 0;
    return `${count} ${count === 1 ? one : many}`;
  };
  return [
    part("businesses", "comercio", "comercios"),
    part("products", "producto", "productos"),
    part("orders", "pedido", "pedidos"),
    part("images", "foto", "fotos"),
    // Los puntajes de los juegos escondidos, solo si hay.
    ...((summary.tables.game_scores ?? 0) > 0 ? [part("game_scores", "puntaje", "puntajes")] : []),
  ].join(", ");
}

/** Nombre de archivo para una copia hecha ahora: comanda-copia-2026-10-04-0930.json.gz */
export function backupFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `comanda-copia-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json.gz`;
}
