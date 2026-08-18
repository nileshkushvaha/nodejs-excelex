import { FormPage } from "@/components/form-page";
import { getCurrentSession, getDestinationOptions, getServiceCentres, getStates } from "@/lib/api";
import { can } from "@/lib/can";
import { ShipperForm } from "../shipper-form";

export const metadata = { title: "New shipper · ExcelEx" };

export default async function NewShipperPage() {
  const [session, origins, centres, states] = await Promise.all([
    getCurrentSession(),
    getDestinationOptions(),
    getServiceCentres(),
    getStates("IN"),
  ]);

  return (
    <FormPage
      backHref="/shippers"
      backLabel="Shippers"
      title="New shipper"
      description="A pickup address, shared across every customer who ships from it."
    >
      <ShipperForm
        shipper={null}
        origins={origins ?? []}
        centres={centres ?? []}
        states={states ?? []}
        canManage={can(session, "customer", "update")}
      />
    </FormPage>
  );
}
