import type { Metadata } from "next";
import Link from "next/link";
import { NewBusinessForm } from "@/components/admin/AdminForms";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Crear comercio" };
export const dynamic = "force-dynamic";

export default async function NewBusinessPage() {
  // Cada página comprueba el permiso por su cuenta, no solo el marco que la envuelve.
  await requireAdmin();
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link href="/admin" className="link inline-flex min-h-11 items-center gap-1 self-start">
        <ChevronLeftIcon width={18} height={18} />
        Comercios
      </Link>
      <div>
        <h1 className="font-display text-display font-bold">Crear comercio</h1>
        <p className="mt-1 text-muted">
          Crea la cuenta de un negocio y entrégale su correo y contraseña. Después él arma su menú desde su panel.
        </p>
      </div>
      <div className="card">
        <NewBusinessForm />
      </div>
    </div>
  );
}
