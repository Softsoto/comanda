import type { Metadata } from "next";
import Link from "next/link";
import { OrderWatcher } from "@/components/panel/OrderWatcher";
import { PanelNav } from "@/components/panel/PanelNav";
import { StoreStatusBar } from "@/components/panel/StoreStatusBar";
import { SiteFooter, Wordmark } from "@/components/ui/SiteChrome";
import { logoutAction } from "@/lib/actions/auth";
import { isAdminEmail } from "@/lib/admin";
import { getOrderPulse } from "@/lib/orders-data";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Panel" };
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, business } = await requireBusiness();
  const pulse = await getOrderPulse(business.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line/25 bg-raised print:hidden">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 px-4 py-1.5">
          <Wordmark href="/panel" />
          <div className="order-2 ml-auto flex items-center lg:order-3">
            {isAdminEmail(user.email) && (
              <Link href="/admin" className="btn btn-ghost btn-sm">
                Administración
              </Link>
            )}
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Salir
              </button>
            </form>
          </div>
          <div className="order-3 -mx-1 w-full min-w-0 lg:order-2 lg:mx-0 lg:w-auto">
            <PanelNav newOrders={pulse.pending} />
          </div>
        </div>
      </header>
      <StoreStatusBar business={business} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 print:m-0 print:max-w-none print:p-0">{children}</main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
      <OrderWatcher lastNumber={pulse.lastNumber} />
    </div>
  );
}
