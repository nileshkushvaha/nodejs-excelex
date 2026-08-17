import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getDestinationOptions, getServiceCentres, getStates } from "@/lib/api";
import { ServiceCentreForm } from "../service-centre-form";

export const metadata = { title: "Edit service centre · ExcelEx" };

export default async function EditServiceCentrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [centres, destinations, states] = await Promise.all([
    getServiceCentres(),
    getDestinationOptions(),
    getStates("IN"),
  ]);

  const centre = centres?.find((row) => row.id === id);
  if (!centre) notFound();

  return (
    <FormPage
      backHref="/network/service-centres"
      backLabel="Service centres"
      title={`Edit ${centre.code}`}
      description={`${centre.name} — next invoice ${centre.invoicePrefix ?? ""}${centre.invoiceLastNo + 1}${centre.invoiceSuffix ?? ""}`}
    >
      <ServiceCentreForm centre={centre} destinations={destinations ?? []} states={states ?? []} />
    </FormPage>
  );
}
