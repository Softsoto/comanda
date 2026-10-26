import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/panel/AuthForms";
import { AuthShell } from "@/components/ui/SiteChrome";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Crear mi menú" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/panel");
  const closed = process.env.ALLOW_SIGNUP === "false";

  return (
    <AuthShell
      title="Crea tu menú"
      intro="Solo necesitas el nombre de tu negocio y el WhatsApp donde quieres recibir los pedidos."
      footer={
        <p className="text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/entrar" className="link">
            Entra aquí
          </Link>
        </p>
      }
    >
      {closed ? <p>El registro de nuevas cuentas está cerrado por ahora.</p> : <RegisterForm />}
    </AuthShell>
  );
}
