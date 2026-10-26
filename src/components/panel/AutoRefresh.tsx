"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Vuelve a pedir los datos de la página cada cierto tiempo, sin recargarla,
 * para que los pedidos nuevos aparezcan solos. Descansa mientras la pestaña
 * no está a la vista.
 */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, seconds * 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, seconds]);
  return null;
}
