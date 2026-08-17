import { FormPage } from "@/components/form-page";
import { getDestinationOptions, getStates, getZones } from "@/lib/api";
import { DestinationForm } from "../destination-form";

export const metadata = { title: "New destination · ExcelEx" };

export default async function NewDestinationPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const [branches, zones, states] = await Promise.all([
    getDestinationOptions(),
    getZones(),
    getStates("IN"),
  ]);

  return (
    <FormPage
      backHref="/network/destinations"
      backLabel="Destinations"
      title="New destination"
      description="A servicing point shipments are booked to."
    >
      <DestinationForm
        destination={null}
        branches={branches ?? []}
        zones={zones ?? []}
        states={states ?? []}
        defaultKind={kind === "INTERNATIONAL" ? "INTERNATIONAL" : "DOMESTIC"}
      />
    </FormPage>
  );
}
