import Link from "next/link";
import type { ReactNode } from "react";
import { SecretTap } from "@/components/secret/SecretTap";
import { APP_NAME, FOOTER_CREDIT } from "@/lib/config";
import { BrandMark } from "./icons";

/** Nombre de la app con su marca; enlaza al inicio. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 font-display text-xl font-bold">
      <BrandMark />
      {APP_NAME}
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-4xl px-4 py-8 text-center text-caption text-muted">
      <SecretTap>{FOOTER_CREDIT}</SecretTap>
    </footer>
  );
}

/** Marco de las páginas de entrar y registrarse: una tarjeta centrada. */
export function AuthShell({ title, intro, children, footer }: { title: string; intro: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
      <header className="py-4">
        <Wordmark />
      </header>
      <main className="flex-1 pt-4 pb-8">
        <h1 className="font-display text-display font-bold">{title}</h1>
        <p className="mt-2 text-muted">{intro}</p>
        <div className="card mt-6">{children}</div>
        <div className="mt-6 text-center">{footer}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
