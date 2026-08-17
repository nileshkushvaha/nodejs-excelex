/**
 * Everything the public site says, in one place.
 *
 * The pages render this; they do not contain copy of their own. That is the
 * whole point — when the CMS arrives it replaces this module with a fetch and
 * the pages do not change. So the shapes here are the contract: an editor is
 * going to fill these fields, which means each one has to be something a
 * non-technical person can be asked for. No class names, no markup, no
 * "leave this blank if".
 */

export interface NavItem {
  label: string;
  href: string;
  /** A menu with children opens a panel; without them it is a plain link. */
  children?: { label: string; href: string; description: string }[];
}

export const NAV: readonly NavItem[] = [
  {
    label: "Services",
    href: "/services",
    children: [
      {
        label: "Domestic express",
        href: "/services#domestic",
        description: "Overnight and second-day delivery across India.",
      },
      {
        label: "International",
        href: "/services#international",
        description: "Door-to-door export and import with customs handling.",
      },
      {
        label: "Surface cargo",
        href: "/services#surface",
        description: "Heavy consignments priced by weight, not urgency.",
      },
      {
        label: "E-commerce",
        href: "/services#ecommerce",
        description: "Cash on delivery, reverse pickup and bulk manifests.",
      },
    ],
  },
  {
    label: "Network",
    href: "/network",
    children: [
      {
        label: "Coverage",
        href: "/network#coverage",
        description: "Where we deliver, and how long it takes.",
      },
      {
        label: "Service centres",
        href: "/network#centres",
        description: "Branches, hubs and the routes between them.",
      },
    ],
  },
  { label: "Track", href: "/track" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

/** The rotating banner. Three is the ceiling — nobody waits for a fourth. */
export const SLIDES: readonly Slide[] = [
  {
    eyebrow: "Nationwide express",
    title: "Every shipment, accounted for.",
    body: "Booking to delivery across India and beyond, on a network built for the people who run it — not just the people who buy it.",
    primary: { label: "Track a shipment", href: "/track" },
    secondary: { label: "Our services", href: "/services" },
  },
  {
    eyebrow: "Built for scale",
    title: "One AWB. One truth.",
    body: "An immutable event history behind every consignment, so what the customer sees and what your operations team sees are the same thing.",
    primary: { label: "See the network", href: "/network" },
    secondary: { label: "Talk to us", href: "/contact" },
  },
  {
    eyebrow: "E-commerce ready",
    title: "Cash on delivery, without the reconciliation.",
    body: "Bulk manifests, reverse pickups and remittance that ties out to the rupee, for sellers shipping hundreds of parcels a day.",
    primary: { label: "Get a quote", href: "/contact" },
    secondary: { label: "How it works", href: "/services#ecommerce" },
  },
];

export interface Service {
  id: string;
  name: string;
  summary: string;
  points: string[];
}

export const SERVICES: readonly Service[] = [
  {
    id: "domestic",
    name: "Domestic express",
    summary: "Overnight to metros, second-day to the rest of the country.",
    points: [
      "Documents and parcels up to 30 kg",
      "Time-definite delivery on metro pairs",
      "Proof of delivery captured at the door",
    ],
  },
  {
    id: "international",
    name: "International",
    summary: "Door-to-door export and import, with the paperwork handled.",
    points: [
      "Customs documentation prepared with the booking",
      "Duty and tax quoted before dispatch",
      "Tracking that continues past the border",
    ],
  },
  {
    id: "surface",
    name: "Surface cargo",
    summary: "For consignments where weight matters more than hours.",
    points: [
      "Priced on chargeable weight, not urgency",
      "Part and full truckload movements",
      "Scheduled line-haul between hubs",
    ],
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    summary: "Built around the way online sellers actually ship.",
    points: [
      "Cash on delivery with same-week remittance",
      "Reverse pickup and RTO handling",
      "Bulk manifest upload and label printing",
    ],
  },
];

export interface Stat {
  value: number;
  suffix: string;
  label: string;
}

/** Counted up when they scroll into view, so the numbers are read. */
export const STATS: readonly Stat[] = [
  { value: 1715, suffix: "+", label: "Destinations served" },
  { value: 48, suffix: "", label: "Service centres" },
  { value: 99.2, suffix: "%", label: "On-time delivery" },
  { value: 24, suffix: "×7", label: "Tracking availability" },
];

export interface Reason {
  title: string;
  body: string;
}

export const REASONS: readonly Reason[] = [
  {
    title: "One shipment, one history",
    body: "Every scan, exception and correction is recorded and kept. Nothing is quietly overwritten, so a dispute has an answer rather than an opinion.",
  },
  {
    title: "Rates you can audit",
    body: "Effective-dated rate cards, surcharges and taxes computed the same way every time. An invoice can be traced back to the card that priced it.",
  },
  {
    title: "Delivery you can plan around",
    body: "Committed transit times per destination pair, published rather than estimated, with exceptions raised the day they happen.",
  },
  {
    title: "People who answer",
    body: "A named service centre behind every pin code, reachable by phone during working hours — not a queue that ends in a form.",
  },
];

export interface Step {
  title: string;
  body: string;
}

export const STEPS: readonly Step[] = [
  { title: "Book", body: "Raise a booking online or call your service centre. You get an AWB immediately." },
  { title: "Pick up", body: "We collect the same day for bookings placed before the branch cut-off." },
  { title: "Move", body: "Scanned at every hub, so the tracking page is never a guess." },
  { title: "Deliver", body: "Proof of delivery captured at the door and visible to you within minutes." },
];

export const CONTACT = {
  addressLines: ["ExcelEx Express Logistics LLP", "New Delhi, India"],
  phone: "+91 11 4000 0000",
  email: "hello@excelex.in",
  hours: "Monday to Saturday, 9:30am – 7:00pm IST",
};

export interface FooterColumn {
  heading: string;
  links: { label: string; href: string }[];
}

export const FOOTER: readonly FooterColumn[] = [
  {
    heading: "Services",
    links: [
      { label: "Domestic express", href: "/services#domestic" },
      { label: "International", href: "/services#international" },
      { label: "Surface cargo", href: "/services#surface" },
      { label: "E-commerce", href: "/services#ecommerce" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About us", href: "/about" },
      { label: "Our network", href: "/network" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Tools",
    links: [
      { label: "Track a shipment", href: "/track" },
      { label: "Customer sign in", href: "/login" },
    ],
  },
];
