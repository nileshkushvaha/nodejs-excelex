import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getCustomer } from "@/lib/api";
import { CustomerTabs } from "./customer-tabs";

/**
 * The shell every customer screen shares.
 *
 * The tabs are routes rather than state: each of the four lists is its own
 * page, so a rate table can be linked, reloaded and opened in a second tab
 * without the customer form's unsaved edits deciding what is on screen.
 */
export default async function CustomerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <Link href="/customers" className="text-xs text-muted transition-colors hover:text-fg">
          ← Customers
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{customer.name}</h1>
        <p className="mt-0.5 font-mono text-xs text-muted">{customer.code}</p>
      </header>

      <CustomerTabs id={id} />

      {children}
    </div>
  );
}
