import type { Metadata } from "next";
import { DeliveryForm, NewZoneForm, ZoneEditor } from "@/components/panel/DeliveryForm";
import { StoreTabs } from "@/components/panel/StoreTabs";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteZoneAction } from "@/lib/actions/delivery";
import { moveAction } from "@/lib/actions/menu";
import { getZones } from "@/lib/data";
import { centsToInput, formatMoney } from "@/lib/money";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Entregas" };
export const dynamic = "force-dynamic";

const iconButton =
  "grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

export default async function DeliveryPage() {
  const { business } = await requireBusiness();
  const zones = await getZones(business.id);
  const input = (cents: number) => (cents > 0 ? centsToInput(cents) : "");
  const offersDelivery = business.deliveryModes.includes("domicilio");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StoreTabs current="entregas" />
      <p className="text-muted">Cómo entregas los pedidos y cuánto cobras por el domicilio.</p>

      <div className="card">
        <DeliveryForm
          deliveryModes={business.deliveryModes.join(",")}
          deliveryFee={input(business.deliveryFeeCents)}
          freeFrom={input(business.freeDeliveryFromCents)}
          minOrder={input(business.minOrderCents)}
          hasZones={zones.length > 0}
        />
      </div>

      <section className="card" aria-labelledby="zonas">
        <h2 id="zonas" className="font-display text-title font-bold">
          Zonas de domicilio
        </h2>
        <p className="mt-1 text-sm text-muted">
          Opcional. Si cobras distinto según el barrio, crea aquí cada zona con su precio: el cliente elige la suya al
          pedir y el domicilio se suma solo. Sin zonas se usa el costo fijo de arriba.
        </p>
        {!offersDelivery && zones.length > 0 && (
          <p className="mt-3 rounded-field border border-line/60 px-3 py-2.5 text-sm">
            Ahora no ofreces entrega a domicilio, así que estas zonas no se muestran en tu menú.
          </p>
        )}

        {zones.length > 0 && (
          <ul className="mt-2 divide-y divide-line/25">
            {zones.map((zone, index) => (
              <li key={zone.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5">
                <p className="min-w-0 flex-1 basis-40 wrap-anywhere">
                  <span className="font-semibold">{zone.name}</span>{" "}
                  <span className="whitespace-nowrap tabular-nums text-muted">
                    · {zone.feeCents > 0 ? formatMoney(zone.feeCents, business.currency) : "Gratis"}
                  </span>
                </p>
                <form action={moveAction} className="flex">
                  <input type="hidden" name="kind" value="zone" />
                  <input type="hidden" name="id" value={zone.id} />
                  <button type="submit" name="direction" value="up" disabled={index === 0} className={iconButton} aria-label={`Subir ${zone.name}`}>
                    <ArrowUpIcon width={20} height={20} />
                  </button>
                  <button
                    type="submit"
                    name="direction"
                    value="down"
                    disabled={index === zones.length - 1}
                    className={iconButton}
                    aria-label={`Bajar ${zone.name}`}
                  >
                    <ArrowDownIcon width={20} height={20} />
                  </button>
                </form>
                <ZoneEditor id={zone.id} name={zone.name} fee={input(zone.feeCents)} />
                <form action={deleteZoneAction}>
                  <input type="hidden" name="id" value={zone.id} />
                  <SubmitButton
                    className="btn btn-ghost btn-sm text-danger"
                    ariaLabel={`Quitar la zona ${zone.name}`}
                    confirm={`¿Quitar la zona "${zone.name}"?`}
                  >
                    Quitar
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className={zones.length > 0 ? "mt-2 border-t border-line/25 pt-4" : "mt-4"}>
          <NewZoneForm />
        </div>
      </section>
    </div>
  );
}
