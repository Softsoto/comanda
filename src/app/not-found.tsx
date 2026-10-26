import Link from "next/link";
import { Wordmark } from "@/components/ui/SiteChrome";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
      <header className="py-4">
        <Wordmark />
      </header>
      <main className="flex flex-1 flex-col justify-center pb-24">
        <h1 className="font-display text-display font-bold">No encontramos esa página</h1>
        <p className="mt-2 text-muted">
          Puede que el enlace esté mal escrito o que el negocio haya cambiado la dirección de su menú.
        </p>
        <div className="mt-6">
          <Link href="/" className="btn btn-primary">
            Ir al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}
