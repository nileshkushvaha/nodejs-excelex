import { FormPage } from "@/components/form-page";
import { getProductGroups, getProductTypes } from "@/lib/api";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product · ExcelEx" };

export default async function NewProductPage() {
  const [types, groups] = await Promise.all([getProductTypes(), getProductGroups()]);

  return (
    <FormPage
      backHref="/products"
      backLabel="Products"
      title="New product"
      description="A sellable service. Shipments are booked against one of these."
    >
      <ProductForm product={null} types={types ?? []} groups={groups ?? []} />
    </FormPage>
  );
}
