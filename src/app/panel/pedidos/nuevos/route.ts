import { getSessionUser } from "@/lib/auth";
import { getBusinessByOwner } from "@/lib/data";
import { getOrderPulse } from "@/lib/orders-data";

export const dynamic = "force-dynamic";

/**
 * Pulso de pedidos: cuántos hay sin atender y el número del último. El panel
 * lo consulta cada pocos segundos para avisar (con sonido) cuando entra uno.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "sin-sesion" }, { status: 401 });
  const business = await getBusinessByOwner(user.id);
  const pulse = business ? await getOrderPulse(business.id) : { pending: 0, lastNumber: 0 };
  return Response.json(pulse, { headers: { "Cache-Control": "no-store" } });
}
