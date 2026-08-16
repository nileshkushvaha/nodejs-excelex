import {
  getCurrentSession,
  getProductGroups,
  getProductTypes,
  getProducts,
} from "@/lib/api";
import { ProductsManager } from "./products-manager";

export const metadata = { title: "Products · ExcelEx" };

export default async function ProductsPage() {
  const [products, types, groups, session] = await Promise.all([
    getProducts(),
    getProductTypes(),
    getProductGroups(),
    getCurrentSession(),
  ]);

  if (!products) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not hold <code className="font-mono">masters.product.view</code>.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-fg">Products</h1>
        <p className="mt-0.5 text-sm text-muted">
          The services shipments are booked against. Seeded from the live ExcelEx product list.
        </p>
      </header>

      <ProductsManager
        products={products}
        types={types ?? []}
        groups={groups ?? []}
        canManage={session?.user.permissions.includes("masters.product.manage") ?? false}
      />
    </div>
  );
}
