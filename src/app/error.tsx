"use client";

/** Pantalla que se muestra si algo falla al cargar una página. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4">
      <h1 className="font-display text-display font-bold">Algo salió mal</h1>
      <p className="mt-2 text-muted">
        No pudimos cargar esta página. Vuelve a intentarlo; si sigue fallando, revisa que la base de datos esté
        disponible.
      </p>
      <div className="mt-6">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Volver a intentar
        </button>
      </div>
    </div>
  );
}
