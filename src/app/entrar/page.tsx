import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/panel/AuthForms";
import { AuthShell } from "@/components/ui/SiteChrome";
import { getSessionUser } from "@/lib/auth";
import { DEMO_EMAIL } from "@/lib/config";
import { findUserByEmail } from "@/lib/data";
import { isLocalDatabase, localDataDir } from "@/lib/db";
import { DEMO_PASSWORD_FILE, readDemoPasswordFile } from "@/lib/demo-account";
import { getBaseUrl, isLocalhostUrl } from "@/lib/panel";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ clave?: string | string[] }> }) {
  if (await getSessionUser()) redirect("/panel");
  const passwordChanged = (await searchParams).clave === "cambiada";
  // La pista de la cuenta de ejemplo solo se muestra a quien abre la app en el mismo
  // computador donde corre. No trae la contraseña: dice dónde está escrita.
  const showDemo =
    isLocalDatabase() &&
    isLocalhostUrl(await getBaseUrl()) &&
    readDemoPasswordFile(localDataDir()) !== null &&
    (await findUserByEmail(DEMO_EMAIL)) !== null;

  return (
    <AuthShell
      title="Entra a tu panel"
      intro="Administra tu menú, tus productos y tu enlace."
      footer={
        <p className="text-muted">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/registro" className="link">
            Crea tu menú
          </Link>
        </p>
      }
    >
      {passwordChanged && (
        <p role="status" className="mb-4 rounded-field bg-brand-tint px-3 py-2.5 text-sm font-semibold">
          Contraseña cambiada. Entra con tu contraseña nueva.
        </p>
      )}
      <LoginForm />
      <p className="mt-3 text-center">
        <Link href="/recuperar" className="link text-sm">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
      {showDemo && (
        <p className="mt-4 rounded-field bg-brand-tint px-3 py-2.5 text-sm">
          <span className="font-semibold">Cuenta de ejemplo para probar:</span>{" "}
          <span className="font-semibold select-all">{DEMO_EMAIL}</span>
          <br />
          Su contraseña es propia de esta instalación: aparece en la ventana de inicio y queda guardada en el archivo{" "}
          <span className="font-semibold wrap-anywhere">data/{DEMO_PASSWORD_FILE}</span> de la carpeta del proyecto.
        </p>
      )}
    </AuthShell>
  );
}
