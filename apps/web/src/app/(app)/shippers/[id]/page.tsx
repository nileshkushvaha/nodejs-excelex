import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import {
  getShipper,
  getCurrentSession,
  getDestinationOptions,
  getServiceCentres,
  getStates,
} from "@/lib/api";
import { ShipperForm } from "../shipper-form";

export const metadata = { title: "Edit shipper · ExcelEx" };

export default async function EditShipperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [shipper, session, origins, centres, states] = await Promise.all([
    getShipper(id),
    getCurrentSession(),
    getDestinationOptions(),
    getServiceCentres(),
    getStates("IN"),
  ]);

  if (!shipper) notFound();

  return (
    <FormPage
      backHref="/shippers"
      backLabel="Shippers"
      title={`Edit ${shipper.code}`}
      description={shipper.name}
    >
      <ShipperForm
        shipper={shipper}
        origins={origins ?? []}
        centres={centres ?? []}
        states={states ?? []}
        canManage={session?.user.permissions.includes("masters.customer.manage") ?? false}
      />
    </FormPage>
  );
}
