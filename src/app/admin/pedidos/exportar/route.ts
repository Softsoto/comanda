import { adminTimezone, requireAdmin } from "@/lib/admin";
import { exportAllOrders } from "@/lib/export";

export const dynamic = "force-dynamic";

/** Excel con los pedidos de todos los comercios. */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  return exportAllOrders(Object.fromEntries(new URL(request.url).searchParams), await adminTimezone(admin.id));
}
