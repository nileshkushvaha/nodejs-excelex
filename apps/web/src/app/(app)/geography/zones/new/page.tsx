import { FormPage } from "@/components/form-page";
import { ZoneForm } from "../zone-form";

export const metadata = { title: "New zone · ExcelEx" };

export default function NewZonePage() {
  return (
    <FormPage
      backHref="/geography/zones"
      backLabel="Zones"
      title="New zone"
      description="Destinations are grouped into zones, and rate cards price zone pairs."
    >
      <ZoneForm zone={null} />
    </FormPage>
  );
}
