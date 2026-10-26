import Link from "next/link";
import { CategoryTitle, NewCategoryForm } from "@/components/panel/CategoryForms";
import { ArrowDownIcon, ArrowUpIcon } from "@/components/ui/icons";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteCategoryAction, moveAction, toggleProductAction } from "@/lib/actions/menu";
import { getMenu, type MenuCategory, type Product } from "@/lib/data";
import { formatMoney } from "@/lib/money";
import { requireBusiness } from "@/lib/panel";

export const dynamic = "force-dynamic";

const iconButton =
  "grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30";

/** Flechas para subir o bajar una categoría o un producto. */
function MoveButtons({ kind, id, name, first, last }: { kind: "category" | "product"; id: string; name: string; first: boolean; last: boolean }) {
  return (
    <form action={moveAction} className="flex">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <button type="submit" name="direction" value="up" disabled={first} className={iconButton} aria-label={`Subir ${name}`}>
        <ArrowUpIcon width={20} height={20} />
      </button>
      <button type="submit" name="direction" value="down" disabled={last} className={iconButton} aria-label={`Bajar ${name}`}>
        <ArrowDownIcon width={20} height={20} />
      </button>
    </form>
  );
}

function ProductRow({ product, currency, first, last }: { product: Product; currency: string; first: boolean; last: boolean }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
      {product.imageId ? (
        <img
          src={`/img/${product.imageId}`}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-field object-cover"
        />
      ) : (
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-field border border-dashed border-line text-center text-[11px] leading-tight text-muted">
          Sin foto
        </span>
      )}
      <div className="min-w-0 flex-1 basis-40">
        <p className="font-semibold wrap-anywhere">{product.name}</p>
        <p className="tabular-nums">
          <span className="font-display font-bold">{formatMoney(product.priceCents, currency)}</span>
          {product.stock !== null && (
            <span className={`ml-2 text-caption ${product.stock === 0 ? "font-semibold text-danger" : "text-muted"}`}>
              {product.stock === 0 ? "Sin existencias" : `Quedan ${product.stock}`}
            </span>
          )}
        </p>
        {product.options.length > 0 && (
          <p className="text-caption wrap-anywhere text-muted">
            Con opciones: {product.options.map((group) => group.name).join(", ")}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <form action={toggleProductAction}>
          <input type="hidden" name="id" value={product.id} />
          <input type="hidden" name="available" value={product.isAvailable ? "0" : "1"} />
          <SubmitButton
            className={`btn btn-sm ${product.isAvailable ? "bg-brand-tint text-ink" : "border border-line text-muted"}`}
            ariaLabel={
              product.isAvailable
                ? `${product.name} está disponible. Marcar como agotado`
                : `${product.name} está agotado. Marcar como disponible`
            }
          >
            {product.isAvailable ? "Disponible" : "Agotado"}
          </SubmitButton>
        </form>
        <MoveButtons kind="product" id={product.id} name={product.name} first={first} last={last} />
        <Link href={`/panel/menu/producto/${product.id}`} className="btn btn-secondary btn-sm" aria-label={`Editar ${product.name}`}>
          Editar
        </Link>
      </div>
    </li>
  );
}

function CategoryCard({ category, currency, first, last }: { category: MenuCategory; currency: string; first: boolean; last: boolean }) {
  const count = category.products.length;
  return (
    <section className="card" aria-labelledby={`categoria-${category.id}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 basis-48">
          <CategoryTitle id={category.id} name={category.name} />
        </div>
        <div className="flex items-center gap-1">
          <MoveButtons kind="category" id={category.id} name={category.name} first={first} last={last} />
          <form action={deleteCategoryAction}>
            <input type="hidden" name="id" value={category.id} />
            <SubmitButton
              className="btn btn-ghost btn-sm text-danger"
              ariaLabel={`Eliminar la categoría ${category.name}`}
              confirm={
                count > 0
                  ? `¿Eliminar "${category.name}" y sus ${count} ${count === 1 ? "producto" : "productos"}? No se puede deshacer.`
                  : `¿Eliminar la categoría "${category.name}"?`
              }
            >
              Eliminar
            </SubmitButton>
          </form>
        </div>
      </div>

      {count === 0 ? (
        <p className="mt-2 text-sm text-muted">Esta categoría aún no tiene productos, así que no aparece en el menú.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line/25">
          {category.products.map((product, index) => (
            <ProductRow key={product.id} product={product} currency={currency} first={index === 0} last={index === count - 1} />
          ))}
        </ul>
      )}

      <div className="mt-3">
        <Link href={`/panel/menu/producto/nuevo?categoria=${category.id}`} className="btn btn-outline-brand btn-sm">
          Añadir producto
        </Link>
      </div>
    </section>
  );
}

export default async function MenuAdminPage() {
  const { business } = await requireBusiness();
  const menu = await getMenu(business.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-display font-bold">Menú</h1>
          <p className="mt-1 max-w-xl text-muted">
            Organiza tus productos por categorías. Toca “Disponible” para marcar un producto como agotado. Los cambios
            se ven al instante en tu menú.
          </p>
        </div>
        <Link href={`/m/${business.slug}`} target="_blank" className="btn btn-secondary btn-sm">
          Ver como cliente
        </Link>
      </div>

      <NewCategoryForm />

      {menu.length === 0 && (
        <p className="card text-muted">
          Aún no hay categorías. Crea la primera arriba y luego agrégale productos.
        </p>
      )}

      {menu.map((category, index) => (
        <CategoryCard
          key={category.id}
          category={category}
          currency={business.currency}
          first={index === 0}
          last={index === menu.length - 1}
        />
      ))}
    </div>
  );
}
