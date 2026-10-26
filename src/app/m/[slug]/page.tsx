import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { MenuView } from "@/components/menu/MenuView";
import { Wordmark } from "@/components/ui/SiteChrome";
import { checkCouponAction, submitOrderAction } from "@/lib/actions/orders";
import { isBillingBlocked } from "@/lib/billing";
import { LIMITS } from "@/lib/config";
import { hasActiveCoupons } from "@/lib/coupons-data";
import { getBanners, getBusinessBySlug, getMenu, getZones } from "@/lib/data";
import { todayKey } from "@/lib/dates";
import { getOpenStatus } from "@/lib/hours";
import { recordVisit } from "@/lib/orders-data";
import { billingOf } from "@/lib/plans-data";
import { getSettings } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";

// El menú se lee de la base de datos en cada visita: los cambios del panel se ven al instante.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function findBusiness(params: Props["params"]) {
  const slug = (await params).slug.toLowerCase();
  return isValidSlug(slug) ? getBusinessBySlug(slug) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const business = await findBusiness(params);
  if (!business) return { title: "Menú no encontrado" };
  return {
    title: { absolute: `${business.name} · Menú` },
    description: `Haz tu pedido a ${business.name} y envíalo por WhatsApp.`,
  };
}

/** Cuenta la visita, salvo que sea un robot o una recarga interna de la propia página. */
async function countVisit(businessId: string, timezone: string) {
  const headerList = await headers();
  const internal = headerList.has("next-action") || headerList.has("next-router-prefetch");
  const robot = /bot|crawl|spider|preview|monitor|headless/i.test(headerList.get("user-agent") ?? "");
  if (internal || robot) return;
  try {
    await recordVisit(businessId, todayKey(timezone));
  } catch {
    // El contador de visitas nunca debe impedir que se vea el menú.
  }
}

export default async function MenuPage({ params }: Props) {
  const business = await findBusiness(params);
  if (!business) notFound();

  // Suspendido por el administrador, o con el plan vencido: el menú no se muestra.
  if (business.isSuspended || isBillingBlocked(await billingOf(business))) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4">
        <header className="py-4">
          <Wordmark />
        </header>
        <main className="flex flex-1 flex-col justify-center pb-24">
          <h1 className="font-display text-display font-bold wrap-anywhere">{business.name}</h1>
          <p className="mt-2 text-muted">Este menú no está disponible por ahora. Vuelve a intentarlo más tarde.</p>
        </main>
      </div>
    );
  }

  const [menu, banners, zones, hasCoupons, settings] = await Promise.all([
    getMenu(business.id),
    getBanners(business.id),
    getZones(business.id),
    hasActiveCoupons(business.id),
    getSettings(),
    countVisit(business.id, business.timezone),
  ]);
  const slides = (slot: "principal" | "barra") =>
    banners
      .filter((banner) => banner.slot === slot)
      .map((banner) => ({ id: banner.id, imageUrl: `/img/${banner.imageId}`, title: banner.title }));

  return (
    <MenuView
      business={{
        name: business.name,
        slug: business.slug,
        whatsapp: business.whatsapp,
        currency: business.currency,
        paymentMethods: business.paymentMethods,
        logoUrl: business.logoImageId ? `/img/${business.logoImageId}` : null,
        deliveryModes: business.deliveryModes,
        deliveryFeeCents: business.deliveryFeeCents,
        zones,
        freeDeliveryFromCents: business.freeDeliveryFromCents,
        minOrderCents: business.minOrderCents,
        hasCoupons,
        privacy: { url: `/m/${business.slug}/privacidad`, checkbox: settings.privacyCheckbox },
        openMode: business.openMode,
        schedule: business.schedule,
        timezone: business.timezone,
        openStatus: getOpenStatus(business.openMode, business.schedule, new Date(), business.timezone),
      }}
      banners={{ principal: slides("principal"), barra: slides("barra") }}
      categories={menu.map((category) => ({
        id: category.id,
        name: category.name,
        // Los costos (del producto y de sus opciones) se quedan en el servidor: aquí solo viaja lo que ve el cliente.
        products: category.products.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          priceCents: product.priceCents,
          imageUrl: product.imageId ? `/img/${product.imageId}` : null,
          available: product.isAvailable && product.stock !== 0,
          maxQuantity: Math.min(product.stock ?? LIMITS.maxQuantity, LIMITS.maxQuantity),
          options: product.options.map((group) => ({
            id: group.id,
            name: group.name,
            min: group.min,
            max: group.max,
            choices: group.choices.map((choice) => ({
              id: choice.id,
              name: choice.name,
              priceCents: choice.priceCents,
              available: choice.available,
            })),
          })),
        })),
      }))}
      submitOrder={submitOrderAction.bind(null, business.slug)}
      checkCoupon={checkCouponAction.bind(null, business.slug)}
    />
  );
}
