import { cookies, headers } from "next/headers";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3001";

export interface CurrentSession {
  client: { id: string; host: string; status?: string };
  user: { id: string; email: string; fullName: string; permissions: string[] };
}

export interface DashboardSummary {
  counts: { users: number; branches: number; roles: number; activeSessions: number };
  recentActivity: Array<{ id: string; action: string; entity: string | null; createdAt: string }>;
}

/**
 * Server-side API client.
 *
 * No business rule executes in the browser, and no page reaches the database:
 * every authenticated read goes through the API, over a request that forwards
 * the session cookie and the original Host — the Host being what the API
 * resolves the client from, so getting it wrong would serve the wrong client's
 * data rather than fail.
 *
 * Reading cookies() also opts every calling route into dynamic rendering, which
 * is what keeps one client's page out of a cache another client could be served
 * from.
 */
async function apiFetch(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);

  const cookieHeader = cookieStore
    .getAll()
    .map((entry) => `${entry.name}=${entry.value}`)
    .join("; ");

  return fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie: cookieHeader,
      host: headerStore.get("host") ?? "localhost",
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    // Redundant against Next 16's defaults, but a cheap guarantee that survives
    // a refactor which removes the cookie read above.
    cache: "no-store",
  });
}

/**
 * Returns null for both "you may not see this" and "the API is unreachable".
 *
 * A transient network failure throws out of fetch(), and an uncaught throw in a
 * server component takes the whole page down with a 500. Callers already handle
 * null by rendering an explanation, so the page degrades to that instead of
 * disappearing while the API restarts.
 */
async function get<T>(path: string): Promise<T | null> {
  try {
    const response = await apiFetch(path);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Used by server actions. The API's own message is surfaced verbatim rather than
 * replaced with something friendlier: "You cannot grant X because you do not
 * hold it yourself" is the useful answer, and a generic "something went wrong"
 * would leave an administrator guessing at an authorization rule.
 */
export async function apiMutate(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<ActionResult> {
  let response: Response;
  try {
    response = await apiFetch(path, { method, body });
  } catch {
    return { ok: false, error: "Could not reach the server. Nothing was changed." };
  }

  if (response.ok) return { ok: true };

  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  const message = Array.isArray(payload?.message) ? payload.message[0] : payload?.message;

  return { ok: false, error: message ?? `Request failed (${response.status}).` };
}

export interface PermissionCatalogueEntry {
  key: string;
  group: string;
  label: string;
  description: string;
}

export interface RoleSummary {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  assignedUsers: number;
}

export interface UserSummary {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: Array<{ roleId: string; name: string; branchCode: string | null; expiresAt: string | null }>;
  directCount: number;
  denyCount: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

export interface UserAccess {
  user: { id: string; email: string; fullName: string; isActive: boolean };
  roles: Array<{
    roleId: string;
    name: string;
    branch: { id: string; code: string } | null;
    expiresAt: string | null;
  }>;
  direct: Array<{
    permission: string;
    effect: "ALLOW" | "DENY";
    reason: string | null;
    expiresAt: string | null;
  }>;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
}

export interface Country {
  code: string;
  alpha3: string;
  name: string;
  dialCode: string | null;
  currency: string | null;
  region: string | null;
}

export interface StateRow {
  code: string;
  name: string;
  type: string;
  gstCode: string | null;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  designationCount: number;
}

export interface Designation {
  id: string;
  code: string;
  name: string;
  description: string | null;
  level: number;
  isActive: boolean;
  department: { id: string; code: string; name: string } | null;
}

export interface GeneralSettings {
  legalName: string;
  tradingName: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  postalCode: string | null;
  timezone: string;
  currency: string;
  dateFormat: string;
  weekStart: number;
  invoicePrefix: string | null;
  invoiceFooter: string | null;
  termsText: string | null;
  logoKey: string | null;
  logoDarkKey: string | null;
  faviconKey: string | null;
  updatedAt: string | null;
}

export type ChargeType = "AIRWAYBILL" | "EXPENSE" | "INCOME" | "PURCHASE";

export type ChargeCalculationBase =
  | "ACTUAL_WEIGHT"
  | "CHARGE_WEIGHT"
  | "COD_AMOUNT"
  | "COMMERCIAL"
  | "FLAT"
  | "FREIGHT"
  | "ODA"
  | "ODA1"
  | "ODA2"
  | "ODA3"
  | "PIECES"
  | "POINT"
  | "SHIPMENT_VALUE";

export interface Charge {
  id: string;
  code: string;
  name: string;
  chargeType: ChargeType;
  calculationBase: ChargeCalculationBase;
  /** Exact decimal, carried as a string end to end. */
  rate: string;
  applyFuel: boolean;
  applyTaxOnFuel: boolean;
  applyTax: boolean;
  hsnCode: string | null;
  sequence: number;
  applyFuelOnComponents: boolean;
  isActive: boolean;
  components: { id: string; code: string; name: string }[];
}

export interface Classification {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  service: string | null;
  contentKind: "DOX" | "NDOX";
  fuelCharge: boolean;
  gstReverse: boolean;
  isActive: boolean;
  productType: { id: string; name: string } | null;
  productGroup: { id: string; name: string } | null;
}

export interface Zone {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface ImportOutcome {
  row: number;
  status: "create" | "update" | "error";
  code: string;
  message?: string;
}

export interface ImportReport {
  mode: "preview" | "commit";
  total: number;
  created: number;
  updated: number;
  failed: number;
  aborted: boolean;
  outcomes: ImportOutcome[];
}

export type DestinationKind = "DOMESTIC" | "INTERNATIONAL";
export type ServiceType = "REGULAR" | "METRO" | "REMOTE";

export interface Destination {
  id: string;
  kind: DestinationKind;
  code: string;
  name: string;
  email: string | null;
  mobile: string | null;
  countryCode: string;
  stateCode: string | null;
  serviceType: ServiceType;
  isActive: boolean;
  zone: { id: string; code: string; name: string } | null;
  mainBranch: { id: string; code: string; name: string } | null;
  manifestBranch: { id: string; code: string; name: string } | null;
}

export interface ServiceCentre {
  id: string;
  code: string;
  name: string;
  subName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  pinCode: string | null;
  countryCode: string;
  stateCode: string | null;
  telephone: string | null;
  email: string | null;
  gstin: string | null;
  gstTelephone: string | null;
  pan: string | null;
  icnNo: string | null;
  stNo: string | null;
  terms: string[];
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  bankAddress: string | null;
  ifsc: string | null;
  micr: string | null;
  invoicePrefix: string | null;
  invoiceLastNo: number;
  invoiceSuffix: string | null;
  freeFormPrefix: string | null;
  freeFormLastNo: number;
  freeFormSuffix: string | null;
  debitNotePrefix: string | null;
  debitNoteLastNo: number;
  debitNoteSuffix: string | null;
  creditNotePrefix: string | null;
  creditNoteLastNo: number;
  creditNoteSuffix: string | null;
  receiptLastNo: number;
  isActive: boolean;
  companyLogoKey: string | null;
  signatoryLogoKey: string | null;
  destination: { id: string; code: string; name: string } | null;
}

export interface SalesExecutive {
  id: string;
  code: string;
  name: string;
  /** Exact decimal as a string — see the API for why it is not a number. */
  commissionPercent: string;
  email: string | null;
  mobile: string | null;
  isActive: boolean;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: string[];
  branches: Branch[];
}

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSpecial: boolean;
  preventReuse: boolean;
  historyCount: number;
  expiryEnabled: boolean;
  expiryDays: number;
  forceChangeOnFirstLogin: boolean;
  updatedAt: string | null;
}

export interface SecuritySettings {
  lockAfterFailedAttempts: boolean;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
  allowMultipleSessions: boolean;
  forceLogoutOnPasswordChange: boolean;
  loginThrottleEnabled: boolean;
  resetThrottleEnabled: boolean;
  notifyUserOnFailedAttempts: boolean;
  notifyUserOnLock: boolean;
  notifyAdminOnLock: boolean;
  updatedAt: string | null;
}

export interface ActiveSession {
  id: string;
  host: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  idleExpiresAt: string;
  current: boolean;
}

export const getPermissionCatalogue = () =>
  get<{ permissions: PermissionCatalogueEntry[] }>("/api/v1/access/permissions");
export const getRoles = () => get<RoleSummary[]>("/api/v1/access/roles");
export const getUsers = () => get<UserSummary[]>("/api/v1/access/users");
export const getBranches = () => get<Branch[]>("/api/v1/access/branches");
export const getUserAccess = (userId: string) =>
  get<UserAccess>(`/api/v1/access/users/${userId}`);
export const getProfile = () => get<Profile>("/api/v1/profile");
export const getActiveSessions = () => get<ActiveSession[]>("/api/v1/profile/sessions");
export const getCountries = () => get<Country[]>("/api/v1/masters/countries");
export const getStates = (country: string) =>
  get<StateRow[]>(`/api/v1/masters/states?country=${encodeURIComponent(country)}`);
export const getDepartments = () => get<Department[]>("/api/v1/masters/departments");
export const getDesignations = () => get<Designation[]>("/api/v1/masters/designations");
export const getDestinationOptions = () =>
  get<Destination[]>("/api/v1/masters/destinations/options");
export const getServiceCentres = () => get<ServiceCentre[]>("/api/v1/masters/service-centres");
export const getSalesExecutives = () =>
  get<SalesExecutive[]>("/api/v1/masters/sales-executives");
export const getDestination = (id: string) =>
  get<Destination>(`/api/v1/masters/destinations/${id}`);
export const getZones = () => get<Zone[]>("/api/v1/masters/zones");
export const getProducts = () => get<Product[]>("/api/v1/masters/products");
export const getCharges = () => get<Charge[]>("/api/v1/masters/charges");
export const getProductTypes = () => get<Classification[]>("/api/v1/masters/product-types");
export const getProductGroups = () => get<Classification[]>("/api/v1/masters/product-groups");
export const getGeneralSettings = () => get<GeneralSettings>("/api/v1/settings/general");
export const getPasswordPolicy = () => get<PasswordPolicy>("/api/v1/settings/password-policy");
export const getSecuritySettings = () => get<SecuritySettings>("/api/v1/settings/security");

/** Returns null when unauthenticated, so callers redirect rather than crash. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  return get<CurrentSession>("/api/v1/auth/me");
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return get<DashboardSummary>("/api/v1/dashboard/summary");
}
