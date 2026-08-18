import { notFound } from "next/navigation";

import { FormPage } from "@/components/form-page";
import {
  getConsignee,
  getCurrentSession,
  getDestinationOptions,
  getServiceCentres,
  getStates,
} from "@/lib/api";
import { ConsigneeForm } from "../consignee-form";

export const metadata = { title: "Edit consignee · ExcelEx" };

export default async function EditConsigneePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [consignee, session, destinations, centres, states] = await Promise.all([
    getConsignee(id),
    getCurrentSession(),
    getDestinationOptions(),
    getServiceCentres(),
    getStates("IN"),
  ]);

  if (!consignee) notFound();

  return (
    <FormPage
      backHref="/consignees"
      backLabel="Consignees"
      title={`Edit ${consignee.code}`}
      description={consignee.name}
    >
      <ConsigneeForm
        consignee={consignee}
        destinations={destinations ?? []}
        centres={centres ?? []}
        states={states ?? []}
        canManage={session?.user.permissions.includes("masters.customer.manage") ?? false}
      />
    </FormPage>
  );
}
