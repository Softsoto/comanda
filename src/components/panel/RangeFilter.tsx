import Form from "next/form";
import Link from "next/link";
import { formatDay } from "@/lib/dates";
import { RANGE_PRESETS, filtersToQuery, type ListFilters } from "@/lib/filters";

export const chipClass = (selected: boolean) =>
  `inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap ${
    selected ? "border border-brand bg-brand-tint text-ink ring-1 ring-brand" : "border border-line bg-raised text-ink hover:border-ink"
  }`;

type Props = {
  /** Página a la que apuntan los enlaces, por ejemplo "/panel/pedidos". */
  path: string;
  filters: ListFilters;
  /** Otros parámetros de la dirección que deben conservarse al cambiar de fechas. */
  keep?: Record<string, string | undefined>;
};

/** Fila de filtros por fecha: períodos rápidos y, aparte, un rango escrito a mano. */
export function RangeFilter({ path, filters, keep = {} }: Props) {
  const custom = filters.preset === null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {RANGE_PRESETS.map((preset) => (
          <Link
            key={preset.value}
            href={`${path}${filtersToQuery({ range: filters.range, preset: preset.value, status: filters.status }, keep)}`}
            aria-current={filters.preset === preset.value ? "true" : undefined}
            className={chipClass(filters.preset === preset.value)}
          >
            {preset.label}
          </Link>
        ))}
      </div>
      <details open={custom} className="group">
        <summary className="link inline-flex min-h-9 cursor-pointer items-center text-sm">Elegir otras fechas</summary>
        <Form action={path} className="mt-2 flex flex-wrap items-end gap-3">
          {filters.status && <input type="hidden" name="estado" value={filters.status} />}
          {Object.entries(keep).map(([key, value]) =>
            value ? <input key={key} type="hidden" name={key} value={value} /> : null,
          )}
          <div>
            <label className="label" htmlFor="filtro-desde">
              Desde
            </label>
            <input id="filtro-desde" type="date" name="desde" className="field w-auto" defaultValue={filters.range.from} required />
          </div>
          <div>
            <label className="label" htmlFor="filtro-hasta">
              Hasta
            </label>
            <input id="filtro-hasta" type="date" name="hasta" className="field w-auto" defaultValue={filters.range.to} required />
          </div>
          <button type="submit" className="btn btn-secondary min-h-12">
            Aplicar
          </button>
        </Form>
      </details>
      <p className="text-sm text-muted">
        {filters.range.from === filters.range.to
          ? `Mostrando el ${formatDay(filters.range.from)}.`
          : `Mostrando del ${formatDay(filters.range.from)} al ${formatDay(filters.range.to)}.`}
      </p>
    </div>
  );
}
