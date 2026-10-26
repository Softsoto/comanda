import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/components/panel/AuthForms";
import { AuthShell } from "@/components/ui/SiteChrome";
import { findPasswordReset } from "@/lib/password-reset";

export const metadata: Metadata = { title: "Contraseña nueva", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const reset = await findPasswordReset(token);

  return (
    <AuthShell
      title="Elige tu contraseña nueva"
      intro={reset ? `Para la cuenta ${reset.email}.` : "Este enlace ya no sirve."}
      footer={
        <p className="text-muted">
          <Link href="/entrar" className="link">
            Volver a entrar
          </Link>
        </p>
      }
    >
      {reset ? (
        <ResetForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p>El enlace venció o ya se usó. Cada enlace sirve una sola vez y durante una hora.</p>
          <Link href="/recuperar" className="btn btn-primary self-start">
            Pedir un enlace nuevo
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
