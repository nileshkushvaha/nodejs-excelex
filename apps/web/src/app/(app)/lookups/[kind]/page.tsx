import { notFound } from "next/navigation";

import { getCurrentSession, getLookups } from "@/lib/api";
import { can } from "@/lib/can";
import { LookupManager } from "./lookup-manager";

/**
 * The six short lists, one screen.
 *
 * Vendors, industries, areas, content types, instructions and customer groups
 * are a code, a name and a switch. Six screens would be six copies of this
 * file with one word changed.
 */
const LISTS = {
  vendors: {
    one: "vendor",
    many: "Vendors",
    blurb: "Carriers and third parties you hand shipments to.",
    resource: "vendor",
  },
  industries: {
    one: "industry",
    many: "Industries",
    blurb: "What a customer's business does. Used for reporting and rate banding.",
    resource: "customer",
  },
  areas: {
    one: "area",
    many: "Areas",
    blurb: "Localities within a city, for pickup rounds and delivery beats.",
    resource: "customer",
  },
  "content-types": {
    one: "content type",
    many: "Content types",
    blurb: "What is inside a consignment. Drives packaging rules and customs paperwork.",
    resource: "product",
  },
  instructions: {
    one: "instruction",
    many: "Instructions",
    blurb: "Standing notes that print on a manifest or a delivery run sheet.",
    resource: "product",
  },
  "customer-groups": {
    one: "customer group",
    many: "Customer groups",
    blurb: "How customers are grouped for rates, reports and statements.",
    resource: "customer",
  },
} as const;

export type ListKind = keyof typeof LISTS;

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const list = LISTS[kind as ListKind];
  return { title: `${list?.many ?? "List"} · ExcelEx` };
}

export default async function LookupPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const list = LISTS[kind as ListKind];
  if (!list) notFound();

  const [rows, session] = await Promise.all([getLookups(kind), getCurrentSession()]);

  if (!rows) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        You do not have permission to see {list.many.toLowerCase()}.
      </p>
    );
  }

  return (
    <div className="animate-fade-up">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{list.many}</h1>
        <p className="mt-0.5 text-sm text-muted">{list.blurb}</p>
      </header>

      <LookupManager
        kind={kind}
        label={{ one: list.one, many: list.many }}
        rows={rows}
        canManage={can(session, list.resource, "update")}
      />
    </div>
  );
}
