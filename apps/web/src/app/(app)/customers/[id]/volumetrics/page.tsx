import { getCurrentSession, getCustomerVolumetrics, getProducts } from "@/lib/api";
import { can } from "@/lib/can";
import { VolumetricsTab } from "./volumetrics-tab";

export const metadata = { title: "Volumetric · ExcelEx" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [rows, products, session] = await Promise.all([
    getCustomerVolumetrics(id),
    getProducts(),
    getCurrentSession(),
  ]);

  return (
    <VolumetricsTab
      customerId={id}
      rows={rows ?? []}
      products={products ?? []}
      canManage={can(session, "customer", "update")}
    />
  );
}
