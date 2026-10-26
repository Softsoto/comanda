import type { Metadata } from "next";
import Link from "next/link";
import { BannerUploader } from "@/components/panel/BannerUploader";
import { StoreTabs } from "@/components/panel/StoreTabs";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { moveAction } from "@/lib/actions/menu";
import { deleteBannerAction } from "@/lib/actions/store";
import { BANNER_SLOTS } from "@/lib/banners";
import { getBanners, type Banner } from "@/lib/data";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Publicidad" };
export const dynamic = "force-dynamic";

const iconButton =
  "grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

function BannerRow({ banner, number, first, last, ratio }: { banner: Banner; number: number; first: boolean; last: boolean; ratio: string }) {
  const name = `la imagen ${number}`;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="w-40 shrink-0 overflow-hidden rounded-field border border-line/40 bg-surface" style={{ aspectRatio: ratio }}>
        <img src={`/img/${banner.imageId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
      </div>
      <p className={`min-w-0 flex-1 basis-40 text-sm wrap-anywhere ${banner.title ? "" : "text-muted"}`}>
        {banner.title || "Sin descripción"}
      </p>
      <div className="flex items-center gap-1">
        <form action={moveAction} className="flex">
          <input type="hidden" name="kind" value="banner" />
          <input type="hidden" name="id" value={banner.id} />
          <button type="submit" name="direction" value="up" disabled={first} className={iconButton} aria-label={`Mostrar antes ${name}`}>
            <ArrowUpIcon width={20} height={20} />
          </button>
          <button type="submit" name="direction" value="down" disabled={last} className={iconButton} aria-label={`Mostrar después ${name}`}>
            <ArrowDownIcon width={20} height={20} />
          </button>
        </form>
        <form action={deleteBannerAction}>
          <input type="hidden" name="id" value={banner.id} />
          <SubmitButton
            className="btn btn-ghost btn-sm text-danger"
            ariaLabel={`Quitar ${name}`}
            confirm="¿Quitar esta imagen de tu menú?"
          >
            Quitar
          </SubmitButton>
        </form>
      </div>
    </li>
  );
}

export default async function AdsPage() {
  const { business } = await requireBusiness();
  const banners = await getBanners(business.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StoreTabs current="publicidad" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-muted">
          Muestra promociones y anuncios encima de tu menú. Es opcional: si no subes imágenes, el menú se ve como
          siempre.
        </p>
        <Link href={`/m/${business.slug}`} target="_blank" className="btn btn-secondary btn-sm">
          Ver como cliente
        </Link>
      </div>

      {BANNER_SLOTS.map((slot) => {
        const own = banners.filter((banner) => banner.slot === slot.value);
        return (
          <section key={slot.value} className="card" aria-labelledby={`espacio-${slot.value}`}>
            <h2 id={`espacio-${slot.value}`} className="font-display text-title font-bold">
              {slot.label}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {slot.help} Tamaño recomendado: {slot.width} × {slot.height} píxeles ({slot.shape}). Hasta {slot.max}{" "}
              imágenes.
            </p>

            {own.length > 0 && (
              <ul className="mt-2 divide-y divide-line/25">
                {own.map((banner, index) => (
                  <BannerRow
                    key={banner.id}
                    banner={banner}
                    number={index + 1}
                    first={index === 0}
                    last={index === own.length - 1}
                    ratio={`${slot.width} / ${slot.height}`}
                  />
                ))}
              </ul>
            )}

            <div className={own.length > 0 ? "mt-2 border-t border-line/25 pt-4" : "mt-4"}>
              <BannerUploader slot={slot.value} disabled={own.length >= slot.max} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
