"use client";

import { useActionState, useRef, useState } from "react";
import { sendTestEmailAction } from "@/lib/actions/recovery";
import { EMPTY_FORM } from "@/lib/form";
import { FormMessage } from "../ui/FormMessage";

/** Botón que envía un correo de prueba a la cuenta del administrador. */
export function EmailTestButton() {
  const [state, formAction, pending] = useActionState(sendTestEmailAction, EMPTY_FORM);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormMessage state={state} />
      <div>
        <button type="submit" className="btn btn-secondary" disabled={pending}>
          {pending ? "Enviando…" : "Enviar un correo de prueba"}
        </button>
      </div>
    </form>
  );
}

const CONFIRM_WORD = "RESTAURAR";

/**
 * Restaurar una copia de seguridad: se elige el archivo, se escribe la palabra
 * de confirmación y se envía. Reemplaza todo lo que hay en la base de datos.
 */
export function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const ready = fileName !== "" && word.trim().toUpperCase() === CONFIRM_WORD && !busy;

  async function restore() {
    const file = fileRef.current?.files?.[0];
    if (!file || !ready) return;
    setBusy(true);
    setResult(null);
    try {
      // El archivo viaja tal cual, como cuerpo de la petición: el servidor lo lee a medida que llega.
      const response = await fetch("/admin/copia/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/gzip", "x-comanda-confirmar": CONFIRM_WORD },
        body: file,
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      setResult({
        ok: Boolean(body?.ok),
        message: body?.message ?? "No se pudo restaurar la copia. La base de datos quedó como estaba.",
      });
      if (body?.ok) {
        setWord("");
        setFileName("");
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch {
      setResult({ ok: false, message: "Se cortó la conexión mientras se enviaba la copia. Revisa en un momento si llegó a restaurarse." });
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {result && <FormMessage state={result} />}
      {result?.ok && (
        <p className="text-sm">
          Si tu cuenta no estaba en la copia, tendrás que{" "}
          <a href="/entrar" className="link">
            entrar de nuevo
          </a>{" "}
          con una cuenta que sí esté.
        </p>
      )}
      <div>
        <label className="label" htmlFor="copia-archivo">
          Archivo de la copia
        </label>
        <input
          ref={fileRef}
          id="copia-archivo"
          type="file"
          accept=".gz,application/gzip"
          className="field h-auto py-2"
          disabled={busy}
          onChange={(event) => {
            setFileName(event.target.files?.[0]?.name ?? "");
            setResult(null);
          }}
        />
      </div>
      <div>
        <label className="label" htmlFor="copia-confirmar">
          Para confirmar, escribe {CONFIRM_WORD}
        </label>
        <input
          id="copia-confirmar"
          className="field max-w-xs uppercase"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={word}
          disabled={busy}
          onChange={(event) => setWord(event.target.value)}
          aria-describedby="copia-confirmar-hint"
        />
        <p id="copia-confirmar-hint" className="hint">
          Se borra todo lo que hay ahora (comercios, menús, pedidos, pagos) y queda lo que trae la copia.
        </p>
      </div>
      <div>
        <button type="button" id="copia-restaurar" className="btn btn-danger" disabled={!ready} onClick={() => void restore()}>
          {busy ? "Restaurando… no cierres esta página" : "Restaurar esta copia"}
        </button>
      </div>
    </div>
  );
}
