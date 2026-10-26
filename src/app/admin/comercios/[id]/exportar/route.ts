import { requireAdmin } from "@/lib/admin";
import { getBusinessById } from "@/lib/data";
import { exportBusinessOrders } from "@/lib/export";
import { isUuid } from "@/lib/slug";

export const dynamic = "force-dynamic";

/** Excel de los pedidos de un comercio, para la administración del servicio. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const business = isUuid(id) ? await getBusinessById(id) : null;
  if (!business) return new Response("Comercio no encontrado", { status: 404 });
  return exportBusinessOrders(business, Object.fromEntries(new URL(request.url).searchParams));
}
