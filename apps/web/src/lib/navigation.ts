/**
 * The navigation vocabulary, defined once and rendered by the sidebar, the
 * mobile drawer and the command palette.
 *
 * Three levels: section → group → item.
 *
 * This covers the full Xpresion menu inventory so the shape of the product is
 * visible from day one and modules can be integrated one at a time. Two
 * deliberate departures from the legacy tree:
 *
 *   The grouping follows the product domains in the baseline (§5), not the old
 *   sidebar. "Master → Sales → Product / Product Master" put sixteen unrelated
 *   masters under a heading that described none of them; here each sits under
 *   the thing it configures.
 *
 *   Duplicates are collapsed, not reproduced. "Servicebale Pincode" and
 *   "Serviceable Pincode" are one screen and a typo; the baseline flags
 *   "Product" versus "Product Master" as needing an audit rather than two
 *   modules. Rebuilding both would carry the confusion forward for another
 *   decade.
 *
 * `comingSoon` marks a screen that does not exist yet. It is shown rather than
 * hidden so the roadmap is legible from inside the product, and so routing is
 * exercised before the module lands.
 *
 * Each entry names the permission that reveals it. Hiding a link is
 * presentation, never protection — the API re-checks the same permission, so
 * typing the URL gets the same answer as clicking.
 */

export type IconName =
  | "dashboard"
  | "shipment"
  | "manifest"
  | "tracking"
  | "customer"
  | "branch"
  | "user"
  | "role"
  | "invoice"
  | "report"
  | "settings"
  | "vendor"
  | "rate"
  | "import";

/** Level 3, or level 2 when a group has no children. */
export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly permission?: string;
  readonly comingSoon?: boolean;
}

/** Level 2. Either a link itself, or a container for level-3 items. */
export interface NavigationGroup {
  readonly label: string;
  readonly icon: IconName;
  readonly href?: string;
  readonly permission?: string;
  readonly comingSoon?: boolean;
  readonly children?: readonly NavigationItem[];
}

/** Level 1. */
export interface NavigationSection {
  readonly title: string;
  readonly groups: readonly NavigationGroup[];
}

const soon = (label: string, href: string, permission?: string): NavigationItem =>
  permission ? { label, href, permission, comingSoon: true } : { label, href, comingSoon: true };

export const NAVIGATION: readonly NavigationSection[] = [
  {
    title: "Operations",
    groups: [
      {
        label: "Dashboard",
        icon: "dashboard",
        href: "/dashboard",
        permission: "operations.dashboard.view",
      },
      {
        label: "Booking",
        icon: "shipment",
        permission: "operations.shipment.view",
        children: [
          soon("AWB entry", "/shipments/new", "operations.shipment.create"),
          soon("All shipments", "/shipments", "operations.shipment.view"),
          soon("AWB inventory", "/shipments/awb", "operations.shipment.view"),
          soon("Pickup in-scan", "/shipments/pickup", "operations.scan.record"),
        ],
      },
      {
        label: "Manifests",
        icon: "manifest",
        permission: "operations.manifest.view",
        children: [
          soon("Manifest view", "/manifests", "operations.manifest.view"),
          soon("Manifest scan", "/manifests/scan", "operations.scan.record"),
          soon("Manifest in-scan", "/manifests/in-scan", "operations.scan.record"),
          soon("Out-scan / OBC entry", "/manifests/out-scan", "operations.scan.record"),
        ],
      },
      {
        label: "Delivery",
        icon: "tracking",
        permission: "operations.scan.record",
        children: [
          soon("DRS scan", "/delivery/drs", "operations.scan.record"),
          soon("Un-delivery scan", "/delivery/undelivered", "operations.scan.record"),
          soon("Mis-route scan", "/delivery/misroute", "operations.scan.record"),
          soon("POD management", "/delivery/pod", "operations.scan.record"),
        ],
      },
      {
        label: "Tracking",
        icon: "tracking",
        permission: "operations.tracking.view",
        children: [
          soon("AWB query", "/tracking", "operations.tracking.view"),
          soon("Forwarding updation", "/tracking/forwarding", "operations.tracking.view"),
          soon("Progress / comments", "/tracking/progress", "operations.tracking.view"),
          soon("Update entry", "/tracking/update", "operations.tracking.view"),
        ],
      },
    ],
  },
  {
    title: "Masters",
    groups: [
      {
        label: "Customers",
        icon: "customer",
        permission: "masters.customer.view",
        children: [
          soon("Customers", "/customers", "masters.customer.view"),
          soon("Customer groups", "/customers/groups", "masters.customer.view"),
          soon("Shippers", "/customers/shippers", "masters.customer.view"),
          soon("Consignees", "/customers/consignees", "masters.customer.view"),
          soon("Customer rates", "/customers/rates", "masters.rate.view"),
        ],
      },
      {
        label: "Network",
        icon: "branch",
        permission: "masters.branch.view",
        children: [
          { label: "Branches", href: "/branches", permission: "masters.branch.view" },
          soon("Service centres", "/network/service-centres", "masters.branch.view"),
          soon("Pin codes", "/network/pincodes", "masters.branch.view"),
          soon("Areas", "/network/areas", "masters.branch.view"),
          soon("Destinations", "/network/destinations", "masters.branch.view"),
          soon("Serviceability", "/network/serviceability", "masters.branch.view"),
        ],
      },
      {
        label: "Geography",
        icon: "tracking",
        children: [
          { label: "Countries", href: "/geography/countries" },
          { label: "States", href: "/geography/states" },
          soon("Zones", "/geography/zones", "masters.rate.view"),
        ],
      },
      {
        label: "Products & services",
        icon: "shipment",
        permission: "masters.product.view",
        children: [
          { label: "Products", href: "/products", permission: "masters.product.view" },
          soon("Product types", "/products/types"),
          soon("Service mapping", "/products/service-mapping"),
          soon("Content types", "/products/contents"),
          soon("Instructions", "/products/instructions"),
          soon("Flights", "/products/flights"),
        ],
      },
      {
        label: "Rates & charges",
        icon: "rate",
        permission: "masters.rate.view",
        children: [
          soon("Rate cards", "/rates", "masters.rate.view"),
          soon("Rate update", "/rates/update", "masters.rate.manage"),
          soon("Rate import", "/rates/import", "masters.rate.manage"),
          soon("Zone update", "/rates/zones", "masters.rate.manage"),
          soon("Charges master", "/rates/charges", "masters.rate.manage"),
          soon("Fuel surcharge", "/rates/fuel", "masters.rate.manage"),
          soon("Tax setup", "/rates/tax", "masters.rate.manage"),
        ],
      },
      {
        label: "Vendors",
        icon: "vendor",
        permission: "masters.vendor.view",
        children: [
          soon("Vendors", "/vendors", "masters.vendor.view"),
          soon("Vendor contracts", "/vendors/contracts", "masters.vendor.view"),
          soon("Bank master", "/vendors/banks", "masters.vendor.manage"),
        ],
      },
      {
        label: "Organisation",
        icon: "user",
        permission: "masters.organisation.view",
        children: [
          {
            label: "Departments",
            href: "/organisation/departments",
            permission: "masters.organisation.view",
          },
          {
            label: "Designations",
            href: "/organisation/designations",
            permission: "masters.organisation.view",
          },
          soon("Sales executives", "/organisation/sales-executives", "settings.user.view"),
          soon("Field executives", "/organisation/field-executives", "settings.user.view"),
          soon("Industries", "/organisation/industries"),
        ],
      },
    ],
  },
  {
    title: "Billing",
    groups: [
      {
        label: "Invoices",
        icon: "invoice",
        permission: "billing.invoice.view",
        children: [
          soon("Invoice generation", "/invoices/generate", "billing.invoice.create"),
          soon("Invoice print", "/invoices/print", "billing.invoice.view"),
          soon("Invoice finalise", "/invoices/finalise", "billing.invoice.finalise"),
        ],
      },
      {
        label: "Receipts",
        icon: "invoice",
        permission: "billing.receipt.record",
        children: [
          soon("Receipt entry", "/receipts", "billing.receipt.record"),
          soon("Customer payments", "/receipts/payments", "billing.receipt.record"),
          soon("Credit limits", "/receipts/credit", "billing.credit.manage"),
        ],
      },
    ],
  },
  {
    title: "Reports",
    groups: [
      {
        label: "Reports",
        icon: "report",
        permission: "reports.operations.view",
        children: [
          soon("Operations", "/reports/operations", "reports.operations.view"),
          soon("AWB report", "/reports/awb", "reports.operations.view"),
          soon("Scan report", "/reports/scan", "reports.operations.view"),
          soon("Statements", "/reports/statements", "reports.financial.view"),
          soon("AR / ageing", "/reports/ar", "reports.financial.view"),
        ],
      },
    ],
  },
  {
    title: "Utility",
    groups: [
      {
        label: "Imports",
        icon: "import",
        permission: "masters.customer.manage",
        children: [
          soon("Data import", "/imports/data"),
          soon("Data updation", "/imports/update"),
          soon("AWB merging", "/imports/awb-merge"),
          soon("POD merging", "/imports/pod-merge"),
          soon("Forwarding merging", "/imports/forwarding-merge"),
          soon("POD to Excel", "/imports/pod-export", "reports.export"),
        ],
      },
      {
        label: "System",
        icon: "settings",
        children: [
          soon("Job queue", "/system/jobs"),
          soon("Notifications", "/system/notifications"),
          soon("Exceptions", "/system/exceptions"),
          soon("System health", "/system/health"),
          soon("Tickets", "/system/tickets"),
        ],
      },
    ],
  },
  {
    title: "Settings",
    groups: [
      {
        label: "General",
        icon: "settings",
        href: "/settings/general",
        permission: "settings.general.view",
      },
      {
        label: "Access",
        icon: "user",
        permission: "settings.user.view",
        children: [
          { label: "Users", href: "/users", permission: "settings.user.view" },
          { label: "Roles", href: "/roles", permission: "settings.role.view" },
          soon("Logged-in users", "/users/active", "settings.session.manage"),
          soon("Audit trail", "/audit", "settings.audit.view"),
        ],
      },
      {
        label: "Security",
        icon: "role",
        permission: "settings.security.view",
        children: [
          {
            label: "Password policy",
            href: "/settings/security",
            permission: "settings.security.view",
          },
          { label: "Login security", href: "/settings/login", permission: "settings.security.view" },
          { label: "Sessions", href: "/settings/sessions", permission: "settings.security.view" },
        ],
      },
      {
        label: "My account",
        icon: "settings",
        children: [
          { label: "My profile", href: "/profile" },
          { label: "Change password", href: "/profile/password" },
        ],
      },
    ],
  },
];

/**
 * Filters the tree to what this actor may see.
 *
 * A group survives if the actor holds its own permission *or* any child's — a
 * group whose children are all hidden is an empty accordion, and a group hidden
 * while its children are visible orphans them.
 */
export function visibleNavigation(permissions: readonly string[]): NavigationSection[] {
  const held = new Set(permissions);
  const allows = (permission?: string) => !permission || held.has(permission);

  return NAVIGATION.map((section) => ({
    title: section.title,
    groups: section.groups
      .map((group) => {
        const children = group.children?.filter((item) => allows(item.permission));

        if (group.children) {
          return children && children.length > 0 ? { ...group, children } : null;
        }

        return allows(group.permission) ? group : null;
      })
      .filter((group): group is NavigationGroup => group !== null),
  })).filter((section) => section.groups.length > 0);
}

/** True when this group contains the current path, so it opens on load. */
export function groupContains(group: NavigationGroup, pathname: string): boolean {
  if (group.href && pathname.startsWith(group.href)) return true;
  return (group.children ?? []).some((item) => pathname === item.href);
}

/**
 * The header quick links — the handful of screens a courier operator opens
 * dozens of times a day, lifted out of the tree so they are one click instead
 * of three.
 */
export const QUICK_LINKS: readonly NavigationItem[] = [
  soon("AWB entry", "/shipments/new", "operations.shipment.create"),
  soon("Manifest", "/manifests", "operations.manifest.view"),
  soon("Manifest in-scan", "/manifests/in-scan", "operations.scan.record"),
  soon("DRS scan", "/delivery/drs", "operations.scan.record"),
  soon("Rate update", "/rates/update", "masters.rate.manage"),
  soon("Rate import", "/rates/import", "masters.rate.manage"),
  soon("Customer master", "/customers", "masters.customer.view"),
];

/** Help menu, in the header. "What's new" was hidden in the legacy app; it stays out. */
export const HELP_LINKS: readonly NavigationItem[] = [
  soon("Help", "/help"),
  soon("FAQ", "/help/faq"),
];
