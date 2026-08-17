import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getCharges } from "@/lib/api";
import { ChargeForm } from "../charge-form";

export const metadata = { title: "Edit charge · ExcelEx" };

export default async function EditChargePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // One fetch serves both the row being edited and the checklist it picks from.
  const charges = await getCharges();
  const charge = charges?.find((row) => row.id === id);
  if (!charge) notFound();

  return (
    <FormPage
      backHref="/rates/charges"
      backLabel="Charges"
      title={`Edit ${charge.code}`}
      description={charge.name}
    >
      <ChargeForm charge={charge} all={charges ?? []} />
    </FormPage>
  );
}
