import { FormPage } from "@/components/form-page";
import { ProductTypeForm } from "../product-type-form";

export const metadata = { title: "New product type · ExcelEx" };

export default function NewProductTypePage() {
  return (
    <FormPage
      backHref="/products/types"
      backLabel="Product types"
      title="New product type"
      description="What kind of movement a product is — Domestic, International, Local, Import."
    >
      <ProductTypeForm type={null} />
    </FormPage>
  );
}
