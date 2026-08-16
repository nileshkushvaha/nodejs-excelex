/**
 * Indian states and union territories, with their GST state codes.
 *
 * The GST code is not decoration. It is the first two digits of every GSTIN
 * issued in that state, so it is what an invoice has to agree with, and getting
 * it wrong produces a tax document that fails validation rather than a cosmetic
 * error. Codes are as per the GST portal's state code list.
 *
 * The union-territory distinction is likewise structural, not a label: it
 * determines whether UTGST or SGST applies to an intra-territory supply.
 *
 * Ladakh (38) was created in 2019 and Daman & Diu merged into Dadra & Nagar
 * Haveli (26) in 2020. Code 25 (the former Daman & Diu) is deliberately absent —
 * it is not reissued, and leaving a gap is more honest than renumbering.
 */
export interface StateSeed {
  code: string;
  name: string;
  type: "STATE" | "UNION_TERRITORY";
  gstCode: string;
}

export const INDIA_STATES: readonly StateSeed[] = [
  { code: "AN", name: "Andaman and Nicobar Islands", type: "UNION_TERRITORY", gstCode: "35" },
  { code: "AP", name: "Andhra Pradesh", type: "STATE", gstCode: "37" },
  { code: "AR", name: "Arunachal Pradesh", type: "STATE", gstCode: "12" },
  { code: "AS", name: "Assam", type: "STATE", gstCode: "18" },
  { code: "BR", name: "Bihar", type: "STATE", gstCode: "10" },
  { code: "CH", name: "Chandigarh", type: "UNION_TERRITORY", gstCode: "04" },
  { code: "CT", name: "Chhattisgarh", type: "STATE", gstCode: "22" },
  { code: "DH", name: "Dadra and Nagar Haveli and Daman and Diu", type: "UNION_TERRITORY", gstCode: "26" },
  { code: "DL", name: "Delhi", type: "UNION_TERRITORY", gstCode: "07" },
  { code: "GA", name: "Goa", type: "STATE", gstCode: "30" },
  { code: "GJ", name: "Gujarat", type: "STATE", gstCode: "24" },
  { code: "HR", name: "Haryana", type: "STATE", gstCode: "06" },
  { code: "HP", name: "Himachal Pradesh", type: "STATE", gstCode: "02" },
  { code: "JK", name: "Jammu and Kashmir", type: "UNION_TERRITORY", gstCode: "01" },
  { code: "JH", name: "Jharkhand", type: "STATE", gstCode: "20" },
  { code: "KA", name: "Karnataka", type: "STATE", gstCode: "29" },
  { code: "KL", name: "Kerala", type: "STATE", gstCode: "32" },
  { code: "LA", name: "Ladakh", type: "UNION_TERRITORY", gstCode: "38" },
  { code: "LD", name: "Lakshadweep", type: "UNION_TERRITORY", gstCode: "31" },
  { code: "MP", name: "Madhya Pradesh", type: "STATE", gstCode: "23" },
  { code: "MH", name: "Maharashtra", type: "STATE", gstCode: "27" },
  { code: "MN", name: "Manipur", type: "STATE", gstCode: "14" },
  { code: "ML", name: "Meghalaya", type: "STATE", gstCode: "17" },
  { code: "MZ", name: "Mizoram", type: "STATE", gstCode: "15" },
  { code: "NL", name: "Nagaland", type: "STATE", gstCode: "13" },
  { code: "OR", name: "Odisha", type: "STATE", gstCode: "21" },
  { code: "PY", name: "Puducherry", type: "UNION_TERRITORY", gstCode: "34" },
  { code: "PB", name: "Punjab", type: "STATE", gstCode: "03" },
  { code: "RJ", name: "Rajasthan", type: "STATE", gstCode: "08" },
  { code: "SK", name: "Sikkim", type: "STATE", gstCode: "11" },
  { code: "TN", name: "Tamil Nadu", type: "STATE", gstCode: "33" },
  { code: "TG", name: "Telangana", type: "STATE", gstCode: "36" },
  { code: "TR", name: "Tripura", type: "STATE", gstCode: "16" },
  { code: "UP", name: "Uttar Pradesh", type: "STATE", gstCode: "09" },
  { code: "UT", name: "Uttarakhand", type: "STATE", gstCode: "05" },
  { code: "WB", name: "West Bengal", type: "STATE", gstCode: "19" },
];

/**
 * Departments a courier company actually runs, and the job titles inside them.
 *
 * Drawn from the operational vocabulary in the baseline — booking, manifests,
 * hub scanning, delivery runs, PODs, billing — rather than a generic corporate
 * org chart. Every client can edit these; they are a starting point, not a
 * constraint.
 *
 * `level` is seniority, low to high, and exists so approval chains have
 * something to compare later. Managing Director carries no department because a
 * "General" bucket invented to satisfy a NOT NULL is how reference data starts
 * lying about the business.
 */
export interface DepartmentSeed {
  code: string;
  name: string;
  description: string;
  designations: ReadonlyArray<{ code: string; name: string; level: number; description?: string }>;
}

export const COURIER_DEPARTMENTS: readonly DepartmentSeed[] = [
  {
    code: "OPS",
    name: "Operations",
    description: "Booking, pickup, hub processing and dispatch.",
    designations: [
      { code: "OPS-EXEC", name: "Operations Executive", level: 10, description: "Books shipments and handles counter work." },
      { code: "OPS-SUP", name: "Operations Supervisor", level: 30, description: "Runs a shift at a branch or hub." },
      { code: "OPS-MGR", name: "Operations Manager", level: 50, description: "Accountable for a region's operational performance." },
      { code: "HUB-INC", name: "Hub In-charge", level: 40, description: "Owns a sorting hub and its scan discipline." },
      { code: "DATA-ENT", name: "Data Entry Operator", level: 5, description: "Enters consignment details from manual booking sheets." },
    ],
  },
  {
    code: "DEL",
    name: "Last Mile Delivery",
    description: "Delivery runs, POD collection and undelivered handling.",
    designations: [
      { code: "DEL-BOY", name: "Delivery Executive", level: 10, description: "Delivers consignments and collects proof of delivery." },
      { code: "FLD-EXEC", name: "Field Executive", level: 15, description: "Handles pickups and field escalations." },
      { code: "DEL-SUP", name: "Delivery Supervisor", level: 30, description: "Allocates delivery runs and reviews exceptions." },
      { code: "DRS-CTL", name: "DRS Controller", level: 25, description: "Prepares and closes delivery run sheets." },
    ],
  },
  {
    code: "CS",
    name: "Customer Service",
    description: "Tracking enquiries, complaints and escalations.",
    designations: [
      { code: "CS-EXEC", name: "Customer Service Executive", level: 10, description: "Answers tracking and status enquiries." },
      { code: "CS-LEAD", name: "Customer Service Lead", level: 30, description: "Owns escalations and service-level breaches." },
    ],
  },
  {
    code: "SALES",
    name: "Sales and Marketing",
    description: "Corporate accounts, rate negotiation and retention.",
    designations: [
      { code: "SLS-EXEC", name: "Sales Executive", level: 15, description: "Acquires and services corporate accounts." },
      { code: "KAM", name: "Key Account Manager", level: 35, description: "Owns the largest customer relationships." },
      { code: "SLS-MGR", name: "Sales Manager", level: 50, description: "Accountable for regional revenue." },
    ],
  },
  {
    code: "FIN",
    name: "Finance and Billing",
    description: "Invoicing, receipts, credit control and reconciliation.",
    designations: [
      { code: "BIL-EXEC", name: "Billing Executive", level: 15, description: "Generates and issues customer invoices." },
      { code: "ACCT", name: "Accountant", level: 30, description: "Maintains books and reconciles receipts." },
      { code: "CRD-CTL", name: "Credit Controller", level: 35, description: "Manages customer credit limits and ageing." },
      { code: "FIN-MGR", name: "Finance Manager", level: 55, description: "Owns financial reporting and controls." },
    ],
  },
  {
    code: "HR",
    name: "Human Resources",
    description: "Recruitment, attendance, payroll and staff records.",
    designations: [
      { code: "HR-EXEC", name: "HR Executive", level: 15, description: "Handles recruitment and staff records." },
      { code: "HR-MGR", name: "HR Manager", level: 50, description: "Owns people policy and payroll." },
    ],
  },
  {
    code: "IT",
    name: "IT and Systems",
    description: "Systems, integrations, devices and support.",
    designations: [
      { code: "IT-SUP", name: "IT Support Executive", level: 15, description: "Supports branch systems, scanners and printers." },
      { code: "SYS-ADM", name: "System Administrator", level: 40, description: "Administers systems, access and integrations." },
    ],
  },
  {
    code: "ADM",
    name: "Administration",
    description: "Facilities, fleet, vendors and compliance.",
    designations: [
      { code: "ADM-EXEC", name: "Admin Executive", level: 15, description: "Handles facilities, vendors and paperwork." },
      { code: "FLT-INC", name: "Fleet In-charge", level: 30, description: "Owns vehicle allocation and maintenance." },
    ],
  },
];

/** Titles that sit above any single department. */
export const EXECUTIVE_DESIGNATIONS: ReadonlyArray<{
  code: string;
  name: string;
  level: number;
  description: string;
}> = [
  { code: "MD", name: "Managing Director", level: 100, description: "Owns the business." },
  { code: "COO", name: "Chief Operating Officer", level: 90, description: "Accountable for all operations." },
  { code: "BR-MGR", name: "Branch Manager", level: 60, description: "Accountable for a whole branch, across departments." },
  { code: "RGN-MGR", name: "Regional Manager", level: 70, description: "Accountable for several branches." },
];
