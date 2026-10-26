"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { saveProductAction } from "@/lib/actions/menu";
import { LIMITS } from "@/lib/config";
import { EMPTY_FORM, type FormState } from "@/lib/form";
import { formatMoney, parsePriceToCents } from "@/lib/money";
import type { OptionGroup } from "@/lib/options";
import { FieldError, FormMessage } from "../ui/FormMessage";
import { ImageField } from "./ImageField";
import { OptionsEditor } from "./OptionsEditor";

type Props = {
  currency: string;
  categories: { id: string; name: string }[];
  /** Datos actuales al editar; al crear solo llega la categoría preseleccionada. */
  product: {
    id?: string;
    name: string;
    description: string;
    price: string;
    /** Costo y existencias llegan como texto; vacío = no se registran. */
    cost: string;
    stock: string;
    categoryId: string;
    isAvailable: boolean;
    imageUrl: string | null;
    /** Tamaños, adicionales y extras. */
    options: OptionGroup[];
  };
};

export function ProductForm({ currency, categories, product }: Props) {
  const imageRef = useRef<Blob | null>(null);
  const [price, setPrice] = useState(product.price);

  const [state, formAction, pending] = useActionState(async (previous: FormState, formData: FormData) => {
    // La foto ya reducida viaja como archivo dentro del mismo formulario.
    formData.delete("image");
    if (imageRef.current) formData.set("image", imageRef.current, "foto.jpg");
    return saveProductAction(previous, formData);
  }, EMPTY_FORM);

  const { errors = {}, values } = state;
  const priceCents = parsePriceToCents(price);
  // El error de precio del servidor se oculta en cuanto la persona lo corrige,
  // para que vuelva a verse la vista previa.
  const priceError = errors.price && price.trim() === (values?.price ?? "") ? errors.price : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      {product.id && <input type="hidden" name="id" value={product.id} />}

      <div>
        <label className="label" htmlFor="name">
          Nombre del producto
        </label>
        <input
          id="name"
          name="name"
          className="field"
          maxLength={LIMITS.productName}
          defaultValue={values?.name ?? product.name}
          placeholder="Hamburguesa clásica"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div>
        <label className="label" htmlFor="description">
          Descripción <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          className="field"
          rows={3}
          maxLength={LIMITS.productDescription}
          defaultValue={values?.description ?? product.description}
          placeholder="Ingredientes, tamaño o lo que la hace especial."
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="price">
            Precio
          </label>
          <input
            id="price"
            name="price"
            className="field"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="18000"
            aria-invalid={priceError ? true : undefined}
            aria-describedby={priceError ? "price-error" : "price-hint"}
          />
          {priceError ? (
            <FieldError id="price-error" message={priceError} />
          ) : (
            <p id="price-hint" className="hint" aria-live="polite">
              {price.trim() === ""
                ? "Solo números, sin el símbolo de la moneda."
                : priceCents === null
                  ? "No se entiende ese precio. Escríbelo solo con números."
                  : `En el menú se verá así: ${formatMoney(priceCents, currency)}. Si el producto tiene tamaños, este es el precio base.`}
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="categoryId">
            Categoría
          </label>
          <select
            key={values?.categoryId ?? product.categoryId}
            id="categoryId"
            name="categoryId"
            className="field"
            defaultValue={values?.categoryId ?? product.categoryId}
            aria-invalid={errors.categoryId ? true : undefined}
            aria-describedby={errors.categoryId ? "categoryId-error" : undefined}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <FieldError id="categoryId-error" message={errors.categoryId} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cost">
            Costo <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="cost"
            name="cost"
            className="field"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={values?.cost ?? product.cost}
            placeholder="9000"
            aria-invalid={errors.cost ? true : undefined}
            aria-describedby={errors.cost ? "cost-error" : "cost-hint"}
          />
          {errors.cost ? (
            <FieldError id="cost-error" message={errors.cost} />
          ) : (
            <p id="cost-hint" className="hint">
              Lo que te cuesta a ti. Solo lo ves tú y sirve para calcular la ganancia.
            </p>
          )}
        </div>

        <div>
          <label className="label" htmlFor="stock">
            Existencias <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            id="stock"
            name="stock"
            className="field"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={values?.stock ?? product.stock}
            placeholder="Sin control"
            aria-invalid={errors.stock ? true : undefined}
            aria-describedby={errors.stock ? "stock-error" : "stock-hint"}
          />
          {errors.stock ? (
            <FieldError id="stock-error" message={errors.stock} />
          ) : (
            <p id="stock-hint" className="hint">
              Unidades que tienes. Baja con cada pedido y, al llegar a cero, el producto se muestra agotado.
            </p>
          )}
        </div>
      </div>

      <OptionsEditor initial={product.options} error={errors.options} />

      <ImageField
        label="Foto"
        variant="photo"
        currentUrl={product.imageUrl}
        error={errors.image}
        onChange={(image) => {
          imageRef.current = image;
        }}
      />

      <label className="flex min-h-11 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="isAvailable"
          id="isAvailable"
          className="h-5 w-5 accent-[var(--brand)]"
          defaultChecked={values ? values.isAvailable === "on" : product.isAvailable}
        />
        <span>
          <span className="font-semibold">Disponible</span>
          <span className="block text-caption text-muted">Si lo desmarcas, aparece como “Agotado” en el menú.</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-3 pt-1">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Guardando…" : product.id ? "Guardar cambios" : "Añadir producto"}
        </button>
        <Link href="/panel/menu" className="btn btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
