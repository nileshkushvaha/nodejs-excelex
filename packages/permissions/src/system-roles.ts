import type { PermissionKey } from "./catalogue";
import { SUPER_PERMISSION } from "./catalogue";

/**
 * The roles every client starts with.
 *
 * System roles are seeded, marked `isSystem`, and cannot be deleted — a client
 * that deletes its only administrator role locks itself out of its own account.
 * Their permission sets can still be amended, because a courier company's idea
 * of what a supervisor does is theirs to decide, not ours.
 *
 * Note the separation of masters.rate.manage from masters.rate.approve: no
 * seeded role holds both, because maker-checker on financially significant
 * changes stops being a control the moment one person can do both halves.
 */
export interface SystemRoleDefinition {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly (PermissionKey | typeof SUPER_PERMISSION)[];
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    name: "Administrator",
    description: "Full access to this account, including users, roles and billing.",
    permissions: [SUPER_PERMISSION],
  },
  {
    name: "Operations Manager",
    description: "Runs day-to-day courier operations across branches.",
    permissions: [
      "operations.dashboard.view",
      "operations.shipment.view",
      "operations.shipment.create",
      "operations.shipment.update",
      "operations.shipment.cancel",
      "operations.manifest.view",
      "operations.manifest.create",
      "operations.manifest.close",
      "operations.manifest.reopen",
      "operations.scan.record",
      "operations.scan.reverse",
      "operations.tracking.view",
      "masters.customer.view",
      "masters.branch.view",
      "reports.operations.view",
    ],
  },
  {
    name: "Branch Operator",
    description: "Books shipments and performs scans within their own branch.",
    permissions: [
      "operations.dashboard.view",
      "operations.shipment.view",
      "operations.shipment.create",
      "operations.manifest.view",
      "operations.scan.record",
      "operations.tracking.view",
      "masters.customer.view",
    ],
  },
  {
    name: "Billing Clerk",
    description: "Generates and finalises invoices, records receipts.",
    permissions: [
      "operations.dashboard.view",
      "operations.shipment.view",
      "billing.invoice.view",
      "billing.invoice.create",
      "billing.invoice.finalise",
      "billing.receipt.record",
      "masters.customer.view",
      "masters.rate.view",
      "reports.financial.view",
    ],
  },
  {
    name: "Read Only",
    description: "Sees operational data without changing anything. Suitable for audit and support.",
    permissions: [
      "operations.dashboard.view",
      "operations.shipment.view",
      "operations.manifest.view",
      "operations.tracking.view",
      "masters.customer.view",
      "masters.branch.view",
      "masters.rate.view",
      "billing.invoice.view",
      "reports.operations.view",
    ],
  },
];
