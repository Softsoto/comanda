import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/config";
import { getBusinessBySlug } from "@/lib/data";
import { formatWhatsapp } from "@/lib/phone";
import { renderPrivacy } from "@/lib/privacy";
import { getSettings } from "@/lib/settings";
import { isValidSlug } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function findBusiness(params: Props["params"]) {
  const slug = (await params).slug.toLowerCase();
  return isValidSlug(slug) ? getBusinessBySlug(slug) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const business = await findBusiness(params);
  return { title: business ? { absolute: `Tratamiento de datos · ${business.name}` } : "Menú no encontrado" };
}

/** Aviso de tratamiento de datos de un negocio: qué datos se piden al hacer un pedido y para qué. */
export default async function PrivacyPage({ params }: Props) {
  const business = await findBusiness(params);
  if (!business) notFound();
  const settings = await getSettings();

  const blocks = renderPrivacy(settings.privacyText, {
    business: business.name,
    contact: business.whatsapp
      ? `Puedes escribirle por WhatsApp al ${formatWhatsapp(business.whatsapp)}.`
      : "Puedes escribirle por el mismo medio por el que haces tu pedido.",
    service: APP_NAME,
  });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4">
      <header className="pt-4">
        <Link href={`/m/${business.slug}`} className="link inline-flex min-h-11 items-center gap-1">
          <ChevronLeftIcon width={18} height={18} />
          Volver al menú
        </Link>
      </header>
      <main className="flex-1 pb-10">
        <h1 className="mt-2 font-display text-display font-bold wrap-anywhere">Tratamiento de datos</h1>
        <p className="mt-1 text-muted wrap-anywhere">{business.name}</p>
        <div className="mt-4 flex flex-col gap-2">
          {blocks.map((block, index) =>
            block.kind === "title" ? (
              <h2 key={index} className="mt-4 font-display text-title font-bold wrap-anywhere">
                {block.text}
              </h2>
            ) : (
              <p key={index} className="whitespace-pre-line wrap-anywhere">
                {block.text}
              </p>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
