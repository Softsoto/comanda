import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/panel/ProductForm";
import { getCategories } from "@/lib/data";
import { requireBusiness } from "@/lib/panel";

export const metadata: Metadata = { title: "Nuevo producto" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ categoria?: string | string[] }> };

export default async function NewProductPage({ searchParams }: Props) {
  const { business } = await requireBusiness();
  const categories = await getCategories(business.id);
  const requested = (await searchParams).categoria;
  const preselected = categories.find((category) => category.id === requested) ?? categories[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link href="/panel/menu" className="link text-sm">
          ← Volver al menú
        </Link>
        <h1 className="mt-2 font-display text-display font-bold">Nuevo producto</h1>
      </div>
      {categories.length === 0 ? (
        <p className="card">
          Primero crea una categoría en{" "}
          <Link href="/panel/menu" className="link">
            Menú
          </Link>
          . Los productos siempre van dentro de una.
        </p>
      ) : (
        <div className="card">
          <ProductForm
            currency={business.currency}
            categories={categories.map(({ id, name }) => ({ id, name }))}
            product={{
              name: "",
              description: "",
              price: "",
              cost: "",
              stock: "",
              categoryId: preselected.id,
              isAvailable: true,
              imageUrl: null,
              options: [],
            }}
          />
        </div>
      )}
    </div>
  );
}
