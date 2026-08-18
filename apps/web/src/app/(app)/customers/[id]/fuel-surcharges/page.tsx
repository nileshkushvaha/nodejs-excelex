import {
  getCurrentSession,
  getCustomerFuelSurcharges,
  getDestinationOptions,
  getProducts,
} from "@/lib/api";
import { FuelSurchargesTab } from "./fuel-surcharges-tab";

export const metadata = { title: "Fuel surcharges · ExcelEx" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rows, products, destinations, session] = await Promise.all([
    getCustomerFuelSurcharges(id),
    getProducts(),
    getDestinationOptions(),
    getCurrentSession(),
  ]);

  return (
    <FuelSurchargesTab
      customerId={id}
      rows={rows ?? []}
      products={products ?? []}
      destinations={destinations ?? []}
      canManage={session?.user.permissions.includes("masters.customer.manage") ?? false}
    />
  );
}
