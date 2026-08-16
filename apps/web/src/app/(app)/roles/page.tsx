import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata = { title: "Roles · ExcelEx" };

export default function RolesPage() {
  return (
    <PlaceholderPage
      title="Roles"
      phase="Phase 1 · in progress"
      description="A permission reads domain.resource.action — operations.shipment.create, billing.invoice.finalise. The vocabulary will live in packages/permissions as a typed constant so a typo in a guard is a compile error rather than a silent authorisation gap."
    />
  );
}
