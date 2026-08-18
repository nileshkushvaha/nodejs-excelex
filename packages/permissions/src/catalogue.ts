/**
 * The permission vocabulary.
 *
 * This file is the source of truth. The `permissions` table is synced from it,
 * not the other way round, which is the difference between this and a
 * database-first design like Spatie's: a permission that does not exist here
 * cannot be granted, and a guard that names one that does not exist here does
 * not compile.
 *
 * Form: <domain>.<resource>.<action>. Domains are product domains from the
 * baseline (§5), not the legacy Xpresion sidebar — "masters.customer.manage",
 * never "master.sales.product_master".
 *
 * Adding a permission means adding it here and running the sync. Removing one
 * means marking it deprecated first: a live role may still reference it, and a
 * hard delete would silently widen or narrow someone's access at deploy time.
 */

export interface PermissionDefinition {
  /** The wire and storage form. Never change one — grant rows reference it. */
  readonly key: string;
  /** Groups the permission in the management UI. */
  readonly group: PermissionGroup;
  readonly label: string;
  readonly description: string;
  /** Still resolvable, hidden from the picker, scheduled for removal. */
  readonly deprecated?: boolean;
}

export type PermissionGroup =
  | "Operations"
  | "Masters"
  | "Billing"
  | "Reports"
  | "Settings"
  | "System";

function define<const T extends readonly PermissionDefinition[]>(definitions: T): T {
  return definitions;
}

export const PERMISSION_DEFINITIONS = define([
  // ── Operations ───────────────────────────────────────────────────────────
  { key: "operations.dashboard.view", group: "Operations", label: "View dashboard", description: "See the operations dashboard and its summary figures." },
  { key: "operations.shipment.view", group: "Operations", label: "View shipments", description: "Search and open shipment records." },
  { key: "operations.shipment.create", group: "Operations", label: "Book shipments", description: "Create a shipment and allocate an AWB." },
  { key: "operations.shipment.update", group: "Operations", label: "Amend shipments", description: "Change shipment details before dispatch." },
  { key: "operations.shipment.cancel", group: "Operations", label: "Cancel shipments", description: "Cancel a booked shipment, with a reason." },
  { key: "operations.manifest.view", group: "Operations", label: "View manifests", description: "Open manifests and their contents." },
  { key: "operations.manifest.create", group: "Operations", label: "Create manifests", description: "Open a new manifest for a route." },
  { key: "operations.manifest.close", group: "Operations", label: "Close manifests", description: "Close a manifest, freezing its contents." },
  { key: "operations.manifest.reopen", group: "Operations", label: "Reopen manifests", description: "Reopen a closed manifest. Deliberately separate from closing." },
  { key: "operations.scan.record", group: "Operations", label: "Record scans", description: "Perform hub, inbound, outbound and delivery scans." },
  { key: "operations.scan.reverse", group: "Operations", label: "Reverse scans", description: "Undo a scan, with a reason and a full audit trail." },
  { key: "operations.tracking.view", group: "Operations", label: "View tracking", description: "See the shipment event timeline." },

  // ── Masters ──────────────────────────────────────────────────────────────
  { key: "masters.customer.view", group: "Masters", label: "View customers", description: "See the customer master." },
  { key: "masters.customer.manage", group: "Masters", label: "Manage customers", description: "Create and amend customers, shippers and consignees." },
  { key: "masters.branch.view", group: "Masters", label: "View branches", description: "See branches and service centres." },
  { key: "masters.branch.manage", group: "Masters", label: "Manage branches", description: "Create and amend branches." },
  { key: "masters.product.view", group: "Masters", label: "View products", description: "See products, product types and groups." },
  { key: "masters.product.manage", group: "Masters", label: "Manage products", description: "Create and amend products and their classifications." },
  { key: "masters.destination.view", group: "Masters", label: "View destinations", description: "See the destination master." },
  { key: "masters.destination.manage", group: "Masters", label: "Manage destinations", description: "Create, amend and import destinations." },
  { key: "masters.rate.view", group: "Masters", label: "View rates", description: "See rate cards, zones and surcharges." },
  { key: "masters.rate.manage", group: "Masters", label: "Manage rates", description: "Create and amend rate cards. Financially significant." },
  { key: "masters.rate.approve", group: "Masters", label: "Approve rate changes", description: "Second approval for a rate change. Never held by the same person who makes them." },
  { key: "masters.organisation.view", group: "Masters", label: "View organisation structure", description: "See departments and designations." },
  { key: "masters.organisation.manage", group: "Masters", label: "Manage organisation structure", description: "Create and amend departments and designations." },
  { key: "masters.vendor.view", group: "Masters", label: "View vendors", description: "See carriers and vendor contracts." },
  { key: "masters.vendor.manage", group: "Masters", label: "Manage vendors", description: "Create and amend carriers and contracts." },

  // ── Billing ──────────────────────────────────────────────────────────────
  { key: "billing.invoice.view", group: "Billing", label: "View invoices", description: "See invoices and their lines." },
  { key: "billing.invoice.create", group: "Billing", label: "Generate invoices", description: "Generate draft invoices from shipments." },
  { key: "billing.invoice.finalise", group: "Billing", label: "Finalise invoices", description: "Finalise an invoice, making it immutable and issuable." },
  { key: "billing.invoice.cancel", group: "Billing", label: "Cancel invoices", description: "Cancel a finalised invoice. Requires a reason." },
  { key: "billing.receipt.record", group: "Billing", label: "Record receipts", description: "Record customer payments and allocate them." },
  { key: "billing.credit.manage", group: "Billing", label: "Manage credit limits", description: "Set customer credit limits and terms." },

  // ── Reports ──────────────────────────────────────────────────────────────
  { key: "reports.operations.view", group: "Reports", label: "Operational reports", description: "Run booking, scan and delivery reports." },
  { key: "reports.financial.view", group: "Reports", label: "Financial reports", description: "Run AR, ageing and revenue reports." },
  { key: "reports.export", group: "Reports", label: "Export report data", description: "Download report output. Separate because export moves data out of the system." },

  // ── Settings ─────────────────────────────────────────────────────────────
  { key: "settings.user.view", group: "Settings", label: "View users", description: "See staff accounts." },
  { key: "settings.user.manage", group: "Settings", label: "Manage users", description: "Invite, deactivate and amend staff accounts." },
  { key: "settings.role.view", group: "Settings", label: "View roles", description: "See roles and what they grant." },
  { key: "settings.role.manage", group: "Settings", label: "Manage roles", description: "Create roles and change what they grant. Effectively grants everything it can assign." },
  { key: "settings.permission.grant", group: "Settings", label: "Grant permissions directly", description: "Grant or deny a permission to one person, bypassing roles." },
  { key: "settings.general.view", group: "Settings", label: "View general settings", description: "See the account's identity, contact and document settings." },
  { key: "settings.general.manage", group: "Settings", label: "Manage general settings", description: "Change the account's legal name, registrations, address and document defaults." },
  { key: "settings.security.view", group: "Settings", label: "View security settings", description: "See the password policy and other account security settings." },
  { key: "settings.security.manage", group: "Settings", label: "Manage security settings", description: "Change the password policy for everyone in this account." },
  { key: "settings.mail.view", group: "Settings", label: "View email settings", description: "See how this account sends email and what it has sent." },
  { key: "settings.mail.manage", group: "Settings", label: "Manage email settings", description: "Change the outgoing mail server and sender, and send test messages." },
  { key: "settings.audit.view", group: "Settings", label: "View audit trail", description: "Read this client's audit events." },
  { key: "settings.session.manage", group: "Settings", label: "Manage sessions", description: "See and revoke other people's sessions." },

  // ── System ───────────────────────────────────────────────────────────────
  // Operating the account rather than using it: what is running, what is
  // scheduled, what is cached, who did what, who signed in, and how the
  // application itself is behaving. View and manage are split throughout
  // because reading a queue is harmless and draining one is not.
  { key: "system.queue.view", group: "System", label: "View job queue", description: "See queued, running and finished background jobs and their outcomes." },
  { key: "system.queue.manage", group: "System", label: "Manage job queue", description: "Retry, cancel and re-queue jobs; pause and resume queues." },
  { key: "system.schedule.view", group: "System", label: "View scheduler", description: "See scheduled jobs and when they last and next run." },
  { key: "system.schedule.manage", group: "System", label: "Manage scheduler", description: "Create, amend, pause and run scheduled jobs." },
  { key: "system.cache.view", group: "System", label: "View cache", description: "See cache namespaces, sizes and hit rates." },
  { key: "system.cache.manage", group: "System", label: "Manage cache", description: "Flush cache namespaces or individual keys. Safe but disruptive under load." },
  { key: "system.login.view", group: "System", label: "View login history", description: "See sign-in attempts — successes, failures and lockouts — for everyone in this account." },
  { key: "system.performance.view", group: "System", label: "View application performance", description: "See request latency, error rates, event-loop and database health for this deployment." },
  { key: "system.exception.view", group: "System", label: "View exceptions", description: "See server-side failures grouped by cause, with their stacks and references." },
  { key: "system.exception.manage", group: "System", label: "Manage exceptions", description: "Resolve, ignore and reopen exception groups." },
] as const satisfies readonly PermissionDefinition[]);

/** Every permission key, as a union type. A typo is a compile error. */
export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_DEFINITIONS.map(
  (definition) => definition.key as PermissionKey,
);

const BY_KEY = new Map<string, PermissionDefinition>(
  PERMISSION_DEFINITIONS.map((d) => [d.key, d]),
);

export function permissionDefinition(key: string): PermissionDefinition | undefined {
  return BY_KEY.get(key);
}

export function isKnownPermission(key: string): key is PermissionKey {
  return BY_KEY.has(key);
}

/**
 * The wildcard that grants everything.
 *
 * A super-administrator holds this like any other grant — visible in the same
 * table, auditable, revocable. There is deliberately no framework-level
 * god-mode hook (Spatie's `Gate::before` pattern), because an authority that
 * does not appear in the grant tables is one nobody reviews.
 */
export const SUPER_PERMISSION = "*";
