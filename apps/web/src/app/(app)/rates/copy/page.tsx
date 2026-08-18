import { FormPage } from "@/components/form-page";
import { getCurrentSession, getCustomers, getDestinationOptions, getProducts } from "@/lib/api";
import { can } from "@/lib/can";
import { CopyRatesForm } from "./copy-form";

export const metadata = { title: "Copy rates · ExcelEx" };

export default async function CopyRatesPage() {
  const [session, customers, products, destinations] = await Promise.all([
    getCurrentSession(),
    getCustomers("page=1&pageSize=100"),
    getProducts(),
    getDestinationOptions(),
  ]);

  return (
    <FormPage
      backHref="/rates"
      backLabel="Rate cards"
      title="Copy rates"
      description="How an annual increase is applied: last year's tariff, plus a percentage, effective from a new date."
    >
      <CopyRatesForm
        customers={(customers?.rows ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        products={(products ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        destinations={destinations ?? []}
        canManage={can(session, "zone", "update")}
      />
    </FormPage>
  );
}
