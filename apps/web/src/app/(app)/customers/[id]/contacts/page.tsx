import { getCurrentSession, getCustomerContacts, getStates } from "@/lib/api";
import { can } from "@/lib/can";
import { ContactsTab } from "./contacts-tab";

export const metadata = { title: "Contacts · ExcelEx" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rows, states, session] = await Promise.all([
    getCustomerContacts(id),
    getStates("IN"),
    getCurrentSession(),
  ]);

  return (
    <ContactsTab
      customerId={id}
      rows={rows ?? []}
      states={states ?? []}
      canManage={can(session, "customer", "update")}
    />
  );
}
