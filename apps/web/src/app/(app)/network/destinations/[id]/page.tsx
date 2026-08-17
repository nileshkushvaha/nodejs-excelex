import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getDestination, getDestinationOptions, getStates, getZones } from "@/lib/api";
import { DestinationForm } from "../destination-form";

export const metadata = { title: "Edit destination · ExcelEx" };

export default async function EditDestinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [destination, branches, zones, states] = await Promise.all([
    // One row by id rather than picking it out of the full list: that was fine
    // at four destinations and wrong at four thousand.
    getDestination(id),
    getDestinationOptions(),
    getZones(),
    getStates("IN"),
  ]);

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
