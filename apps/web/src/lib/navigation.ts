/**
 * The shared navigation vocabulary, defined once and rendered by the sidebar,
 * the mobile menu and the breadcrumb.
 *
 * Each item names the permission that reveals it. Hiding a link is presentation,
 * never protection — the API re-checks the same permission on every request, and
 * a user who types the URL directly gets the same answer as one who clicks. The
 * permission strings become a typed constant in packages/permissions, at which
 * point a typo here is a compile error rather than an item that never appears.
 *
 * The grouping follows the product domains in the baseline (§5), not the legacy
 * Xpresion sidebar, which is why "Masters" holds customers and branches rather
 * than reproducing the old Master → Sales → Product tree.
 */

export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly permission?: string;
  readonly icon: IconName;
  /** Shown but not linked, with a "Phase n" marker, so the roadmap is visible. */
  readonly comingSoon?: boolean;
}

export interface NavigationSection {
  readonly title: string;
  readonly items: readonly NavigationItem[];
}

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

export const NAVIGATION: readonly NavigationSection[] = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "operations.dashboard.view" },
      { label: "Shipments", href: "/shipments", icon: "shipment", permission: "operations.shipment.view", comingSoon: true },
      { label: "Manifests", href: "/manifests", icon: "manifest", permission: "operations.manifest.view", comingSoon: true },
      { label: "Tracking", href: "/tracking", icon: "tracking", comingSoon: true },
    ],
  },
  {
    title: "Masters",
    items: [
      { label: "Customers", href: "/customers", icon: "customer", permission: "masters.customer.view", comingSoon: true },
      { label: "Branches", href: "/branches", icon: "branch", permission: "masters.branch.view" },
    ],
  },
  {
    title: "Billing",
    items: [{ label: "Invoices", href: "/invoices", icon: "invoice", comingSoon: true }],
  },
  {
    title: "Settings",
    items: [
      { label: "Users", href: "/users", icon: "user", permission: "settings.user.view" },
      { label: "Roles", href: "/roles", icon: "role", permission: "settings.role.view" },
      { label: "Preferences", href: "/settings", icon: "settings" },
    ],
  },
];

export function visibleSections(permissions: readonly string[]): NavigationSection[] {
  const held = new Set(permissions);

  return NAVIGATION.map((section) => ({
    title: section.title,
    items: section.items.filter((item) => !item.permission || held.has(item.permission)),
  })).filter((section) => section.items.length > 0);
}
