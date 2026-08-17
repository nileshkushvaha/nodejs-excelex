import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getProductGroups, getProductTypes, getProducts } from "@/lib/api";
import { ProductForm } from "../product-form";

export const metadata = { title: "Edit product · ExcelEx" };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [products, types, groups] = await Promise.all([
    getProducts(),
    getProductTypes(),
    getProductGroups(),
  ]);

  const product = products?.find((row) => row.id === id);
  if (!product) notFound();

  return (
    <FormPage
      backHref="/products"
      backLabel="Products"
      title={`Edit ${product.code}`}
      description={product.name}
    >
      <ProductForm product={product} types={types ?? []} groups={groups ?? []} />
    </FormPage>
  );
}
