import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getProductTypes } from "@/lib/api";
import { ProductTypeForm } from "../product-type-form";

export const metadata = { title: "Edit product type · ExcelEx" };

export default async function EditProductTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A handful of rows, so the list is cheaper to reuse than a second endpoint.
  const types = await getProductTypes();
  const type = types?.find((row) => row.id === id);
  if (!type) notFound();

  return (
    <FormPage
      backHref="/products/types"
      backLabel="Product types"
      title={`Edit ${type.code}`}
      description={type.name}
    >
      <ProductTypeForm type={type} />
    </FormPage>
  );
}
