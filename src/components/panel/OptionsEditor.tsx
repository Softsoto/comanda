"use client";

import { useRef, useState } from "react";
import { centsToInput } from "@/lib/money";
import { OPTION_LIMITS, type OptionGroup, type OptionGroupDraft } from "@/lib/options";
import { CloseIcon } from "../ui/icons";

/** Cómo se elige dentro de un grupo. De aquí salen el mínimo y el máximo que se guardan. */
const GROUP_KINDS = [
  { value: "una-obligatoria", label: "El cliente elige una (obligatorio)", example: "Tamaño, sabor" },
  { value: "una-opcional", label: "Puede elegir una (opcional)", example: "Tipo de salsa" },
  { value: "varias-opcional", label: "Puede elegir varias (opcional)", example: "Adicionales, extras" },
  { value: "varias-obligatoria", label: "Elige una o varias (obligatorio)", example: "Ingredientes de la pizza" },
] as const;

type GroupKind = (typeof GROUP_KINDS)[number]["value"];

type ChoiceState = { key: string; id: string; name: string; price: string; cost: string; available: boolean };
type GroupState = { key: string; id: string; name: string; kind: GroupKind; max: string; choices: ChoiceState[] };

function kindOf(group: OptionGroup): GroupKind {
  if (group.max <= 1) return group.min >= 1 ? "una-obligatoria" : "una-opcional";
  return group.min >= 1 ? "varias-obligatoria" : "varias-opcional";
}

/** Lo que se envía al servidor: el mismo formato que revisa validateOptionDrafts. */
function toDrafts(groups: GroupState[]): OptionGroupDraft[] {
  return groups.map((group) => {
    const several = group.kind.startsWith("varias");
    const max = Number(group.max);
    return {
      id: group.id || undefined,
      name: group.name,
      min: group.kind.endsWith("obligatoria") ? 1 : 0,
      // Sin máximo escrito, se pueden elegir todas las opciones del grupo.
      max: !several ? 1 : Number.isInteger(max) && max >= 1 ? max : 99,
      choices: group.choices.map((choice) => ({
        id: choice.id || undefined,
        name: choice.name,
        price: choice.price,
        cost: choice.cost,
        available: choice.available,
      })),
    };
  });
}

type Props = {
  /** Opciones actuales del producto (vacío al crear). */
  initial: OptionGroup[];
  /** Mensaje del servidor si algo de las opciones no se pudo guardar. */
  error?: string;
};

/**
 * Editor de las opciones de un producto: grupos como "Tamaño" o "Adiciones",
 * cada uno con sus opciones y lo que suman al precio. Lo escrito viaja al
 * servidor como texto dentro del campo oculto "options".
 */
export function OptionsEditor({ initial, error }: Props) {
  const counter = useRef(0);
  const newKey = () => `nuevo-${(counter.current += 1)}`;
  const emptyChoice = (name = ""): ChoiceState => ({ key: newKey(), id: "", name, price: "", cost: "", available: true });

  const [groups, setGroups] = useState<GroupState[]>(() =>
    initial.map((group) => ({
      key: group.id,
      id: group.id,
      name: group.name,
      kind: kindOf(group),
      max: group.max > 1 && group.max < group.choices.length ? String(group.max) : "",
      choices: group.choices.map((choice) => ({
        key: choice.id,
        id: choice.id,
        name: choice.name,
        price: choice.priceCents > 0 ? centsToInput(choice.priceCents) : "",
        cost: choice.costCents === null ? "" : centsToInput(choice.costCents),
        available: choice.available,
      })),
    })),
  );

  const patchGroup = (key: string, patch: Partial<GroupState>) =>
    setGroups((current) => current.map((group) => (group.key === key ? { ...group, ...patch } : group)));
  const patchChoice = (groupKey: string, choiceKey: string, patch: Partial<ChoiceState>) =>
    setGroups((current) =>
      current.map((group) =>
        group.key === groupKey
          ? { ...group, choices: group.choices.map((choice) => (choice.key === choiceKey ? { ...choice, ...patch } : choice)) }
          : group,
      ),
    );
  const addGroup = (name: string, kind: GroupKind, choices: string[]) => {
    const group: GroupState = { key: newKey(), id: "", name, kind, max: "", choices: choices.map((choice) => emptyChoice(choice)) };
    setGroups((current) => [...current, group]);
  };

  const canAddGroup = groups.length < OPTION_LIMITS.groups;

  return (
    <section aria-labelledby="opciones-titulo" className="flex flex-col gap-3">
      <input type="hidden" name="options" value={JSON.stringify(toDrafts(groups))} />
      <div>
        <h2 id="opciones-titulo" className="label mb-0">
          Tamaños y adicionales <span className="font-normal text-muted">(opcional)</span>
        </h2>
        <p className="hint mt-1">
          Lo que el cliente puede elegir al pedir este producto: el tamaño, el término, adiciones… Cada opción puede
          sumar un valor al precio.
        </p>
      </div>
      {error && (
        <p role="alert" className="field-error mt-0">
          {error}
        </p>
      )}

      {groups.map((group, groupIndex) => {
        const several = group.kind.startsWith("varias");
        return (
          <fieldset key={group.key} className="flex flex-col gap-3 rounded-field border border-line/60 p-3">
            <legend className="px-1 text-sm font-semibold text-muted">Grupo {groupIndex + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`grupo-${group.key}-nombre`}>
                  Nombre del grupo
                </label>
                <input
                  id={`grupo-${group.key}-nombre`}
                  className="field"
                  maxLength={OPTION_LIMITS.name}
                  placeholder="Tamaño, Adiciones, Término…"
                  value={group.name}
                  onChange={(event) => patchGroup(group.key, { name: event.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor={`grupo-${group.key}-tipo`}>
                  ¿Cómo se elige?
                </label>
                <select
                  id={`grupo-${group.key}-tipo`}
                  className="field"
                  value={group.kind}
                  onChange={(event) => patchGroup(group.key, { kind: event.target.value as GroupKind })}
                >
                  {GROUP_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {several && (
              <div className="sm:max-w-[calc(50%-0.375rem)]">
                <label className="label" htmlFor={`grupo-${group.key}-max`}>
                  ¿Cuántas puede elegir como máximo? <span className="font-normal text-muted">(opcional)</span>
                </label>
                <input
                  id={`grupo-${group.key}-max`}
                  className="field"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Todas las que quiera"
                  value={group.max}
                  onChange={(event) => patchGroup(group.key, { max: event.target.value.replace(/\D/g, "").slice(0, 2) })}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Opciones</p>
              {group.choices.map((choice, choiceIndex) => {
                const base = `opcion-${group.key}-${choice.key}`;
                const label = choice.name.trim() || `opción ${choiceIndex + 1}`;
                return (
                  <div
                    key={choice.key}
                    className="grid grid-cols-2 items-end gap-x-2 gap-y-1.5 border-t border-line/25 pt-2 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="col-span-2 sm:col-span-1">
                      <label className="mb-1 block text-caption text-muted" htmlFor={`${base}-nombre`}>
                        Nombre
                      </label>
                      <input
                        id={`${base}-nombre`}
                        className="field"
                        maxLength={OPTION_LIMITS.name}
                        placeholder={several ? "Queso extra" : "Grande"}
                        value={choice.name}
                        onChange={(event) => patchChoice(group.key, choice.key, { name: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-caption text-muted" htmlFor={`${base}-precio`}>
                        Suma al precio
                      </label>
                      <input
                        id={`${base}-precio`}
                        className="field"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        value={choice.price}
                        onChange={(event) => patchChoice(group.key, choice.key, { price: event.target.value })}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-caption text-muted" htmlFor={`${base}-costo`}>
                        Tu costo
                      </label>
                      <input
                        id={`${base}-costo`}
                        className="field"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="Opcional"
                        value={choice.cost}
                        onChange={(event) => patchChoice(group.key, choice.key, { cost: event.target.value })}
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:min-h-12">
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[var(--brand)]"
                          checked={choice.available}
                          onChange={(event) => patchChoice(group.key, choice.key, { available: event.target.checked })}
                        />
                        Disponible
                      </label>
                      <button
                        type="button"
                        className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-danger"
                        aria-label={`Quitar la ${label}`}
                        onClick={() =>
                          patchGroup(group.key, { choices: group.choices.filter((item) => item.key !== choice.key) })
                        }
                      >
                        <CloseIcon width={20} height={20} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={group.choices.length >= OPTION_LIMITS.choices}
                onClick={() => patchGroup(group.key, { choices: [...group.choices, emptyChoice()] })}
              >
                Añadir opción
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm text-danger"
                onClick={() => setGroups((current) => current.filter((item) => item.key !== group.key))}
              >
                Quitar grupo
              </button>
            </div>
          </fieldset>
        );
      })}

      {canAddGroup ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-outline-brand btn-sm"
            onClick={() => addGroup("Tamaño", "una-obligatoria", ["Pequeño", "Mediano", "Grande"])}
          >
            Añadir tamaños
          </button>
          <button
            type="button"
            className="btn btn-outline-brand btn-sm"
            onClick={() => addGroup("Adiciones", "varias-opcional", [""])}
          >
            Añadir adicionales
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addGroup("", "una-obligatoria", [""])}>
            Otro grupo
          </button>
        </div>
      ) : (
        <p className="text-sm text-muted">Un producto puede tener máximo {OPTION_LIMITS.groups} grupos de opciones.</p>
      )}
    </section>
  );
}
