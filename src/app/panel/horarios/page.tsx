import type { Metadata } from "next";
import Link from "next/link";
import { ScheduleForm } from "@/components/panel/ScheduleForm";
import { StoreTabs } from "@/components/panel/StoreTabs";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { setOpenModeAction } from "@/lib/actions/store";
import { TIMEZONES } from "@/lib/dates";
import { OPEN_MODES, hasAnyHours } from "@/lib/hours";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Horarios" };
export const dynamic = "force-dynamic";

export default async function HoursPage() {
  const { business } = await requireBusiness();
  const zone = TIMEZONES.find((item) => item.value === business.timezone)?.label ?? business.timezone;
  const hasHours = hasAnyHours(business.schedule);
  const modeLabel = OPEN_MODES.find((mode) => mode.value === business.openMode)?.label ?? "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <StoreTabs current="horarios" />
      <p className="text-muted">
        Marca los días que atiendes y a qué horas. Con la opción “Según horario” tu tienda abre y cierra sola, y tus
        clientes ven el horario en el menú.
      </p>

      {business.openMode === "horario" ? (
        <p className="rounded-field bg-brand-tint px-3 py-2.5 text-sm">
          <strong className="font-semibold">Tu tienda sigue este horario.</strong> Fuera de estas horas el menú se
          puede ver, pero no recibe pedidos.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-field border border-line/60 bg-raised px-3 py-2.5 text-sm">
          <p className="min-w-0 flex-1 basis-56">
            Ahora tu tienda está en “{modeLabel}” de forma fija: este horario no se está usando.
          </p>
          {hasHours && (
            <form action={setOpenModeAction}>
              <SubmitButton name="mode" value="horario" className="btn btn-outline-brand btn-sm">
                Usar este horario
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      <div className="card">
        <ScheduleForm initial={business.schedule} />
      </div>

      <p className="text-sm text-muted">
        Si cierras después de la medianoche, escribe la hora tal cual: por ejemplo, de 6:00 p. m. a 2:00 a. m. Las
        horas son las de tu zona horaria, {zone}; puedes cambiarla en{" "}
        <Link href="/panel/perfil" className="link">
          Datos
        </Link>
        .
      </p>
    </div>
  );
}
