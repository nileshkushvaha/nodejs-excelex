import { FormPage } from "@/components/form-page";
import { getDestinationOptions, getStates } from "@/lib/api";
import { ServiceCentreForm } from "../service-centre-form";

export const metadata = { title: "New service centre · ExcelEx" };

export default async function NewServiceCentrePage() {
  const [destinations, states] = await Promise.all([getDestinationOptions(), getStates("IN")]);

  return (
    <FormPage
      backHref="/network/service-centres"
      backLabel="Service centres"
      title="New service centre"
      description="The registered entity that issues invoices. Its GST registration, bank account and numbering are its own."
    >
      <ServiceCentreForm centre={null} destinations={destinations ?? []} states={states ?? []} />
    </FormPage>
  );
}
