import { FormPage } from "@/components/form-page";
import { getCharges } from "@/lib/api";
import { ChargeForm } from "../charge-form";

export const metadata = { title: "New charge · ExcelEx" };

export default async function NewChargePage() {
  // The whole list, because a charge may be built from any of the others.
  const charges = await getCharges();

  return (
    <FormPage
      backHref="/rates/charges"
      backLabel="Charges"
      title="New charge"
      description="A line that can appear on an invoice beside the freight."
    >
      <ChargeForm charge={null} all={charges ?? []} />
    </FormPage>
  );
}
