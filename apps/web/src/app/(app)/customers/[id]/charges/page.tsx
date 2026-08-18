import { can } from "@/lib/can";
import {
  getCharges,
  getCurrentSession,
  getCustomerCharges,
  getDestinationOptions,
  getProducts,
} from "@/lib/api";
import { ChargesTab } from "./charges-tab";

export const metadata = { title: "Other charges · ExcelEx" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rows, charges, products, destinations, session] = await Promise.all([
    getCustomerCharges(id),
    getCharges(),
    getProducts(),
    getDestinationOptions(),
    getCurrentSession(),
  ]);

  return (
    <ChargesTab
      customerId={id}
      rows={rows ?? []}
      charges={charges ?? []}
      products={products ?? []}
      destinations={destinations ?? []}
      canManage={can(session, "customer", "update")}
    />
  );
}
