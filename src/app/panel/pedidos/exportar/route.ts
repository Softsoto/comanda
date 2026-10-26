import { exportBusinessOrders } from "@/lib/export";
import { requireBusiness } from "@/lib/panel";

export const dynamic = "force-dynamic";

/** Descarga los pedidos del negocio en Excel, con los mismos filtros de la lista. */
export async function GET(request: Request) {
  const { business } = await requireBusiness();
  return exportBusinessOrders(business, Object.fromEntries(new URL(request.url).searchParams));
}
