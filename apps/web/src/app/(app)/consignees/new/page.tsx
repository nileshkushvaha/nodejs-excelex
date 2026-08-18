import { FormPage } from "@/components/form-page";
import { getCurrentSession, getDestinationOptions, getServiceCentres, getStates } from "@/lib/api";
import { ConsigneeForm } from "../consignee-form";

export const metadata = { title: "New consignee · ExcelEx" };

export default async function NewConsigneePage() {
  const [session, destinations, centres, states] = await Promise.all([
    getCurrentSession(),
    getDestinationOptions(),
    getServiceCentres(),
    getStates("IN"),
  ]);

  return (
    <FormPage
      backHref="/consignees"
      backLabel="Consignees"
      title="New consignee"
      description="A delivery address, shared across every customer who ships to it."
    >
      <ConsigneeForm
        consignee={null}
        destinations={destinations ?? []}
        centres={centres ?? []}
        states={states ?? []}
        canManage={session?.user.permissions.includes("masters.customer.manage") ?? false}
      />
    </FormPage>
  );
}
