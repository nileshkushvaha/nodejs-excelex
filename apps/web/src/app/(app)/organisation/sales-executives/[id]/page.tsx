import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getSalesExecutives } from "@/lib/api";
import { SalesExecutiveForm } from "../sales-executive-form";

export const metadata = { title: "Edit sales executive · ExcelEx" };

export default async function EditSalesExecutivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const executives = await getSalesExecutives();
  const executive = executives?.find((row) => row.id === id);
  if (!executive) notFound();

  return (
    <FormPage
      backHref="/organisation/sales-executives"
      backLabel="Sales executives"
      title={`Edit ${executive.code}`}
      description={`${executive.name} — ${executive.commissionPercent}% commission`}
    >
      <SalesExecutiveForm executive={executive} />
    </FormPage>
  );
}
