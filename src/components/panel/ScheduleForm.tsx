"use client";

import { useActionState, useState } from "react";
import { saveScheduleAction } from "@/lib/actions/store";
import { EMPTY_FORM } from "@/lib/form";
import { DAY_NAMES, DAY_ORDER, MAX_RANGES_PER_DAY, type TimeRange, type WeeklySchedule } from "@/lib/hours";
import { FormMessage } from "../ui/FormMessage";
import { CloseIcon } from "../ui/icons";

const DEFAULT_RANGE: TimeRange = { from: "09:00", to: "18:00" };
const SECOND_RANGE: TimeRange = { from: "18:00", to: "22:00" };

/**
 * Editor del horario de atención: por cada día, si abre y a qué horas.
 * Admite dos tramos por día (por ejemplo, almuerzo y cena).
 */
export function ScheduleForm({ initial }: { initial: WeeklySchedule }) {
  const [schedule, setSchedule] = useState<WeeklySchedule>(initial);
  const [state, formAction, pending] = useActionState(saveScheduleAction, EMPTY_FORM);
  const errors = state.errors ?? {};

  const setDay = (day: number, ranges: TimeRange[]) =>
    setSchedule((current) => current.map((item, index) => (index === day ? ranges : item)));

  const setTime = (day: number, position: number, key: keyof TimeRange, value: string) =>
    setDay(
      day,
      schedule[day].map((range, index) => (index === position ? { ...range, [key]: value } : range)),
    );

  // El primer día con horas sirve de modelo para "copiar a todos".
  const model = DAY_ORDER.find((day) => schedule[day].length > 0);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="schedule" value={JSON.stringify(schedule)} />
      <FormMessage state={state} />

      <ul className="flex flex-col divide-y divide-line/25">
        {DAY_ORDER.map((day) => {
          const ranges = schedule[day];
          const open = ranges.length > 0;
          const name = DAY_NAMES[day];
          const error = errors[`day${day}`];
          return (
            <li key={day} className="py-3 first:pt-0">
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                <label className="flex min-h-11 w-32 shrink-0 cursor-pointer items-center gap-3 font-semibold">
                  <input
                    type="checkbox"
                    className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                    checked={open}
                    onChange={(event) => setDay(day, event.target.checked ? [{ ...DEFAULT_RANGE }] : [])}
                  />
                  {name}
                </label>

                {!open ? (
                  <p className="flex min-h-11 items-center text-muted">Cerrado</p>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-1">
                    {ranges.map((range, position) => (
                      <div key={position} className="flex items-center gap-2">
                        <input
                          type="time"
                          className="field w-auto min-w-0 flex-1 sm:min-w-32 sm:flex-none"
                          aria-label={`${name}: abre a las${ranges.length > 1 ? ` (tramo ${position + 1})` : ""}`}
                          aria-invalid={error ? true : undefined}
                          value={range.from}
                          onChange={(event) => setTime(day, position, "from", event.target.value)}
                        />
                        <span className="text-muted">a</span>
                        <input
                          type="time"
                          className="field w-auto min-w-0 flex-1 sm:min-w-32 sm:flex-none"
                          aria-label={`${name}: cierra a las${ranges.length > 1 ? ` (tramo ${position + 1})` : ""}`}
                          aria-invalid={error ? true : undefined}
                          value={range.to}
                          onChange={(event) => setTime(day, position, "to", event.target.value)}
                        />
                        {position > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost w-11 px-0"
                            aria-label={`Quitar el segundo tramo del ${name.toLowerCase()}`}
                            onClick={() => setDay(day, ranges.slice(0, position))}
                          >
                            <CloseIcon width={20} height={20} />
                          </button>
                        )}
                      </div>
                    ))}
                    {ranges.length < MAX_RANGES_PER_DAY && (
                      <div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm -ml-3 text-brand"
                          onClick={() => setDay(day, [...ranges, { ...SECOND_RANGE }])}
                        >
                          Añadir otro tramo
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar horario"}
        </button>
        {model !== undefined && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setSchedule(schedule.map(() => schedule[model].map((range) => ({ ...range }))))}
          >
            Copiar el {DAY_NAMES[model].toLowerCase()} a todos los días
          </button>
        )}
      </div>
    </form>
  );
}
