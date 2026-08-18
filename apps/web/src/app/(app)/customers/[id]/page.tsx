import { can } from "@/lib/can";
import {
  getBranches,
  getCurrentSession,
  getCustomer,
  getDestinationOptions,
  getSalesExecutives,
  getServiceCentres,
  getStates,
} from "@/lib/api";
import { notFound } from "next/navigation";
import { CustomerForm } from "../customer-form";

export const metadata = { title: "Customer · ExcelEx" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [customer, session, centres, destinations, states, executives, branches] = await Promise.all([
    getCustomer(id),
    getCurrentSession(),
    getServiceCentres(),
    getDestinationOptions(),
    getStates("IN"),
    getSalesExecutives(),
    getBranches(),
  ]);

  if (!customer) notFound();

  return (
    <CustomerForm
      customer={customer}
      centres={centres ?? []}
      destinations={destinations ?? []}
      states={states ?? []}
      executives={executives ?? []}
      branches={(branches ?? []).map((row) => ({ id: row.id, code: row.code, name: row.name }))}
      canManage={can(session, "customer", "update")}
    />
  );
}
