import { getCurrentSession, getProductTypes } from "@/lib/api";
import { ProductTypesManager } from "./product-types-manager";

export const metadata = { title: "Product types · ExcelEx" };

export default async function ProductTypesPage() {
  const [types, session] = await Promise.all([getProductTypes(), getCurrentSession()]);

  if (!types) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.product.view</code>.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Product types</h1>
        <p className="mt-0.5 text-sm text-muted">
          What kind of movement a product is — Domestic, International, Local, Import. Where a
          shipment goes, not how it travels.
        </p>
      </header>

      <ProductTypesManager
        types={types}
        canManage={session?.user.permissions.includes("masters.product.manage") ?? false}
      />
    </div>
  );
}
