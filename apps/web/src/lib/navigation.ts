/**
 * The navigation vocabulary, defined once and rendered by the sidebar and the
 * mobile drawer.
 *
 * Three levels: section → group → item. The legacy Xpresion sidebar was two
 * levels with sixty-odd leaves under "Master", which is why finding anything in
 * it required knowing where it already was. Grouping follows the product domains
 * in the baseline (§5) rather than the old tree.
 *
 * Each entry names the permission that reveals it. Hiding a link is presentation,
 * never protection — the API re-checks the same permission on every request, so
 * typing the URL gets the same answer as clicking. The permission strings become
 * a typed import from @excelex/permissions once the web app consumes it.
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
  | "settings";

/** Level 3, or level 2 when a group has no children. */
export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly permission?: string;
  /** Rendered but not linked, with a phase marker, so the roadmap stays visible. */
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
        label: "Shipments",
        icon: "shipment",
        permission: "operations.shipment.view",
        children: [
          { label: "Book a shipment", href: "/shipments/new", permission: "operations.shipment.create", comingSoon: true },
          { label: "All shipments", href: "/shipments", permission: "operations.shipment.view", comingSoon: true },
          { label: "AWB inventory", href: "/shipments/awb", permission: "operations.shipment.view", comingSoon: true },
        ],
      },
      {
        label: "Manifests",
        icon: "manifest",
        permission: "operations.manifest.view",
        children: [
          { label: "Open manifests", href: "/manifests", permission: "operations.manifest.view", comingSoon: true },
          { label: "Hub scan", href: "/manifests/scan", permission: "operations.scan.record", comingSoon: true },
          { label: "Inbound scan", href: "/manifests/inbound", permission: "operations.scan.record", comingSoon: true },
        ],
      },
      { label: "Tracking", icon: "tracking", href: "/tracking", comingSoon: true },
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
          { label: "Customer list", href: "/customers", permission: "masters.customer.view", comingSoon: true },
          { label: "Shippers", href: "/customers/shippers", permission: "masters.customer.view", comingSoon: true },
          { label: "Consignees", href: "/customers/consignees", permission: "masters.customer.view", comingSoon: true },
        ],
      },
      { label: "Branches", icon: "branch", href: "/branches", permission: "masters.branch.view" },
    ],
  },
  {
    title: "Billing",
    groups: [
      {
        label: "Invoices",
        icon: "invoice",
        children: [
          { label: "Draft invoices", href: "/invoices", comingSoon: true },
          { label: "Receipts", href: "/invoices/receipts", comingSoon: true },
        ],
      },
    ],
  },
  {
    title: "Settings",
    groups: [
      {
        label: "Access",
        icon: "user",
        permission: "settings.user.view",
        children: [
          { label: "Users", href: "/users", permission: "settings.user.view" },
          { label: "Roles", href: "/roles", permission: "settings.role.view" },
        ],
      },
      {
        label: "Security",
        icon: "role",
        permission: "settings.security.view",
        children: [
          { label: "Password policy", href: "/settings/security", permission: "settings.security.view" },
          { label: "Login security", href: "/settings/login", permission: "settings.security.view", comingSoon: true },
          { label: "Sessions", href: "/settings/sessions", permission: "settings.security.view", comingSoon: true },
        ],
      },
      { label: "My profile", icon: "settings", href: "/profile" },
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
