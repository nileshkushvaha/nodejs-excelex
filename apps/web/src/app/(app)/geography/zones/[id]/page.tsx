import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import { getZones } from "@/lib/api";
import { ZoneForm } from "../zone-form";

export const metadata = { title: "Edit zone · ExcelEx" };

export default async function EditZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // The list is small enough to fetch whole and pick from. A dedicated
  // single-row endpoint earns its place when a master is large enough that
  // fetching the list to render one row is wasteful.
  const zones = await getZones();
  const zone = zones?.find((row) => row.id === id);
  if (!zone) notFound();

  return (
    <FormPage
      backHref="/geography/zones"
      backLabel="Zones"
      title={`Edit ${zone.code}`}
      description={zone.name}
    >
      <ZoneForm zone={zone} />
    </FormPage>
  );
}
