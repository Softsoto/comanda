import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/panel/ProductForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { deleteProductAction } from "@/lib/actions/menu";
import { getCategories, getProduct } from "@/lib/data";
import { centsToInput } from "@/lib/money";
import { requireBusiness } from "@/lib/panel";
import { isUuid } from "@/lib/slug";

export const metadata: Metadata = { title: "Editar producto" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditProductPage({ params }: Props) {
  const { business } = await requireBusiness();
  const { id } = await params;
  const product = isUuid(id) ? await getProduct(business.id, id) : null;
  if (!product) notFound();
  const categories = await getCategories(business.id);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link href="/panel/menu" className="link text-sm">
          ← Volver al menú
        </Link>
        <h1 className="mt-2 font-display text-display font-bold wrap-anywhere">Editar producto</h1>
      </div>

      <div className="card">
        <ProductForm
          currency={business.currency}
          categories={categories.map(({ id: categoryId, name }) => ({ id: categoryId, name }))}
          product={{
            id: product.id,
            name: product.name,
            description: product.description,
            price: centsToInput(product.priceCents),
            cost: product.costCents === null ? "" : centsToInput(product.costCents),
            stock: product.stock === null ? "" : String(product.stock),
            categoryId: product.categoryId,
            isAvailable: product.isAvailable,
            imageUrl: product.imageId ? `/img/${product.imageId}` : null,
            options: product.options,
          }}
        />
      </div>

      <form action={deleteProductAction} className="card flex flex-wrap items-center justify-between gap-3">
        <input type="hidden" name="id" value={product.id} />
        <p className="text-sm text-muted">Eliminar este producto lo quita del menú para siempre.</p>
        <SubmitButton
          className="btn btn-danger btn-sm"
          confirm={`¿Eliminar "${product.name}"? No se puede deshacer.`}
          pendingText="Eliminando…"
        >
          Eliminar producto
        </SubmitButton>
      </form>
    </div>
  );
}
