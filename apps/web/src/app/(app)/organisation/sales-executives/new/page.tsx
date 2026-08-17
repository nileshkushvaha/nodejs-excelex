import { FormPage } from "@/components/form-page";
import { SalesExecutiveForm } from "../sales-executive-form";

export const metadata = { title: "New sales executive · ExcelEx" };

export default function NewSalesExecutivePage() {
  return (
    <FormPage
      backHref="/organisation/sales-executives"
      backLabel="Sales executives"
      title="New sales executive"
      description="Commission is a share of the sale, so it cannot exceed 100%."
    >
      <SalesExecutiveForm executive={null} />
    </FormPage>
  );
}
