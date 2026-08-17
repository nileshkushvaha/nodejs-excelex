import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getDestinationOptions, getDestinations, getStates, getZones } from "@/lib/api";
import { DestinationForm } from "../destination-form";

export const metadata = { title: "Edit destination · ExcelEx" };

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [branches, zones, states] = await Promise.all([
    getDestinationOptions(),
    getZones(),
    getStates("IN"),
  ]);

  // The options list is already every destination, so the row is found there
  // rather than by a second query for one record.
  const destination = branches?.find((row) => row.id === id);
  if (!destination) notFound();

  return (
    <FormPage
      backHref="/network/destinations"
      backLabel="Destinations"
      title={`Edit ${destination.code}`}
      description={destination.name}
    >
      <DestinationForm
        destination={destination}
        branches={branches ?? []}
        zones={zones ?? []}
        states={states ?? []}
        defaultKind={destination.kind}
      />
    </FormPage>
  );
}
