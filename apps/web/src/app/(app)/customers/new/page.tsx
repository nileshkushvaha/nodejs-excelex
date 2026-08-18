import { can } from "@/lib/can";
import { FormPage } from "@/components/form-page";
import {
  getBranches,
  getCurrentSession,
  getDestinationOptions,
  getSalesExecutives,
  getServiceCentres,
  getStates,
} from "@/lib/api";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "New customer · ExcelEx" };

export default async function NewCustomerPage() {
  const [session, centres, destinations, states, executives, branches] = await Promise.all([
    getCurrentSession(),
    getServiceCentres(),
    getDestinationOptions(),
    getStates("IN"),
    getSalesExecutives(),
    getBranches(),
  ]);

  return (
    <FormPage
      backHref="/customers"
      backLabel="Customers"
      title="New customer"
      description="Code and name are enough to create one. Rates and contacts are added after it exists."
    >
      <CustomerForm
        customer={null}
        centres={centres ?? []}
        destinations={destinations ?? []}
        states={states ?? []}
        executives={executives ?? []}
        branches={(branches ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
        canManage={can(session, "customer", "update")}
      />
    </FormPage>
  );
}
