"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloseIcon } from "../ui/icons";
import { playChime, unlockAudio } from "./chime";

const SETTING_KEY = "comanda:aviso-pedidos";
const CHANGE_EVENT = "comanda:aviso-pedidos";
const POLL_SECONDS = 20;

function alertEnabled(): boolean {
  try {
    return window.localStorage.getItem(SETTING_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Vigila la llegada de pedidos mientras el panel está abierto, en cualquiera
 * de sus páginas. Cuando entra uno muestra un aviso y, si el dueño lo activó
 * en este dispositivo, suena y lanza una notificación.
 */
export function OrderWatcher({ lastNumber }: { lastNumber: number }) {
  const router = useRouter();
  // Solo el valor con el que se abrió la página: después manda lo que diga cada consulta.
  const last = useRef(lastNumber);
  const [notice, setNotice] = useState<{ number: number; count: number } | null>(null);

  useEffect(() => {
    let stopped = false;

    async function check() {
      let pulse: { lastNumber?: unknown };
      try {
        const response = await fetch("/panel/pedidos/nuevos", { cache: "no-store" });
        if (!response.ok) return;
        pulse = await response.json();
      } catch {
        return; // sin conexión: se intenta de nuevo en la próxima vuelta
      }
      const newest = Number(pulse.lastNumber);
      if (stopped || !Number.isFinite(newest) || newest <= last.current) return;

      const count = newest - last.current;
      last.current = newest;
      setNotice({ number: newest, count });
      router.refresh();
      if (!alertEnabled()) return;
      playChime(2);
      // Con el panel en segundo plano, además avisa el sistema (si se dio permiso).
      if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        try {
          const notification = new Notification(count === 1 ? `Nuevo pedido #${newest}` : `${count} pedidos nuevos`, {
            body: "Ábrelo en tu panel para atenderlo.",
            tag: "comanda-pedido",
          });
          notification.onclick = () => window.focus();
        } catch {
          // Algunos navegadores no permiten crear notificaciones desde la página: queda el sonido.
        }
      }
    }

    const timer = window.setInterval(check, POLL_SECONDS * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    // El navegador solo deja sonar después de un toque: el primero que haya prepara el sonido.
    const unlock = () => {
      if (alertEnabled()) void unlockAudio();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [router]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] print:hidden"
    >
      <div className="cart-bar-in mx-auto flex w-full max-w-md items-center gap-2 rounded-full bg-ink py-1.5 pr-1.5 pl-5 text-surface">
        <p className="min-w-0 flex-1 font-semibold">
          {notice.count === 1 ? `Nuevo pedido #${notice.number}` : `${notice.count} pedidos nuevos`}
        </p>
        <Link
          href="/panel/pedidos?estado=nuevo"
          className="btn btn-sm accent-hover bg-accent text-on-accent"
          onClick={() => setNotice(null)}
        >
          Ver
        </Link>
        <button
          type="button"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-full hover:bg-surface/15"
          aria-label="Cerrar el aviso"
          onClick={() => setNotice(null)}
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>
    </div>
  );
}

/**
 * Interruptor del aviso con sonido. La elección se guarda en este dispositivo:
 * cada celular o computador donde se abra el panel decide si suena.
 */
export function OrderAlertToggle() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    setEnabled(alertEnabled());
    setReady(true);
    const sync = () => setEnabled(alertEnabled());
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  function save(value: boolean) {
    try {
      window.localStorage.setItem(SETTING_KEY, value ? "1" : "0");
    } catch {
      // Sin almacenamiento: el aviso funciona hasta que se cierre esta pestaña.
    }
    setEnabled(value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  async function ring() {
    const running = await unlockAudio();
    setNote(running && playChime() ? "" : "Este navegador no permitió reproducir el sonido.");
  }

  async function turnOn() {
    save(true);
    await ring();
    if ("Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {
        // Sin notificaciones del sistema: queda el sonido.
      }
    }
  }

  // Hasta leer lo guardado no se sabe qué mostrar; se reserva el espacio para que la página no salte.
  if (!ready) return <div className="min-h-14" aria-hidden="true" />;

  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-field border border-line/50 bg-raised px-3 py-2">
      <p className="min-w-0 flex-1 basis-56 text-sm">
        <strong className="font-semibold">Aviso con sonido: {enabled ? "activado" : "desactivado"}.</strong>{" "}
        <span className="text-muted">
          {enabled
            ? "Este dispositivo suena cuando entra un pedido, mientras tengas el panel abierto."
            : "Actívalo para que este dispositivo suene cuando entre un pedido."}
        </span>
        {note && (
          <span role="alert" className="block font-semibold text-danger">
            {note}
          </span>
        )}
      </p>
      {enabled ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void ring()}>
            Probar sonido
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(false)}>
            Desactivar
          </button>
        </div>
      ) : (
        <button type="button" id="activar-aviso" className="btn btn-outline-brand btn-sm" onClick={() => void turnOn()}>
          Activar aviso
        </button>
      )}
    </div>
  );
}
