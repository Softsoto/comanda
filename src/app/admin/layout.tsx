import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { SiteFooter, Wordmark } from "@/components/ui/SiteChrome";
import { logoutAction } from "@/lib/actions/auth";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: { default: "Administración", template: "%s · Administración" } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line/25 bg-raised">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 px-4 py-1.5">
          <Wordmark href="/admin" />
          <span className="rounded-full border border-line px-2.5 py-0.5 text-caption font-semibold text-muted max-[399px]:hidden">
            Administración
          </span>
          <div className="order-2 ml-auto flex items-center lg:order-3">
            <Link href="/panel" className="btn btn-ghost btn-sm">
              Mi panel
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Salir
              </button>
            </form>
          </div>
          <div className="order-3 -mx-1 w-full min-w-0 lg:order-2 lg:mx-0 lg:w-auto">
            <AdminNav />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <SiteFooter />
    </div>
  );
}
