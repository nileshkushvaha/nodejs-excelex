import { cookies, headers } from "next/headers";

import {
  ApiError,
  ApiUnavailableError,
  networkFailure,
  readErrorBody,
  type ApiFieldError,
} from "./api-error";

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

  // The address the browser came from, passed along so the API's login
  // history and rate limits see the person rather than this server. The API
  // only believes it when it is told how many proxies to trust.
  const forwardedFor = headerStore.get("x-forwarded-for");

  return fetch(`${API_ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie: cookieHeader,
      host: headerStore.get("host") ?? "localhost",
      ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    // Redundant against Next 16's defaults, but a cheap guarantee that survives
    // a refactor which removes the cookie read above.
    cache: "no-store",
  });
}

/**
 * A read, with its failure typed.
 *
 * Three things can go wrong and they mean different things to a page: the
 * reader may not see this (401 → sign in; 403/404 → "you do not hold…"),
 * the request itself was refused (a 4xx worth showing), or the API did not
 * answer at all (5xx or no connection). Before this, all three were `null`,
 * and an outage rendered on twenty-six pages as a permission problem.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function getResult<T>(path: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await apiFetch(path);
  } catch {
    return { ok: false, error: networkFailure(path) };
  }

  if (!response.ok) {
    const body = await readErrorBody(response);
    const error =
      response.status >= 500 ? new ApiUnavailableError(response.status, body, path) : new ApiError(response.status, body);
    return { ok: false, error };
  }

  return { ok: true, data: (await response.json()) as T };
}

/**
 * Returns null for "you may not see this" and throws for "the API did not answer".
 *
 * Null keeps the meaning every page already gives it — the amber "you do not
 * hold this permission" panel — for 401/403/404 and any other refusal. An
 * outage is different: nothing the reader did caused it and no permission
 * would fix it, so it is thrown as an ApiUnavailableError and stops the page
 * at the nearest error boundary, which shows the status and the reference.
 */
async function get<T>(path: string): Promise<T | null> {
  const result = await getResult<T>(path);
  if (result.ok) return result.data;
  if (result.error instanceof ApiUnavailableError) throw result.error;
  return null;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  /**
   * The response body, when the endpoint returned one.
   *
   * Only a create has anything to say — the id of what it made, so the caller
   * can send the user to it rather than back to a list to hunt for it.
   */
  data?: unknown;
  /** The API's stable error code, for a form that wants to react to one. */
  code?: string;
  /** What a person quotes to support; the same id as the API's log line. */
  reference?: string;
  /** Field path → first message, for a form that places errors beside inputs. */
  fieldErrors?: Record<string, string>;
  /** Every issue, in order, when the API returned more than one sentence. */
  messages?: string[];
  /** The raw field errors, for a form that wants codes or several per field. */
  errors?: ApiFieldError[];
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
    return failed(networkFailure(path));
  }

  // 204 is the normal answer to a PUT or DELETE here, and calling .json() on
  // an empty body throws.
  if (response.ok) {
    if (response.status === 204) return { ok: true };
    return { ok: true, data: await response.json().catch(() => undefined) };
  }

  return failed(new ApiError(response.status, await readErrorBody(response)));
}

/** An ApiError as the ActionResult a form reads. */
export function failed(error: ApiError): ActionResult {
  return {
    ok: false,
    error: error.message,
    code: error.code,
    reference: error.reference ?? undefined,
    messages: error.messages,
    ...(error.errors.length ? { errors: error.errors, fieldErrors: error.fieldErrors() } : {}),
  };
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
  status: "create" | "update" | "error" | "skipped";
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
export interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  mobile: string | null;
  email: string | null;
  isActive: boolean;
  contractHead: string | null;
  branch: { id: string; code: string; name: string } | null;
  serviceCentre: { id: string; code: string; name: string } | null;
}

export interface CustomerPage {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/**
 * One customer, whole.
 *
 * Loose on purpose: the form has ninety fields and typing each one here would
 * be a second copy of the schema to keep in step with the first. The server
 * validates; this only has to carry the values to the inputs.
 */
export type Customer = Record<string, string | number | boolean | null> & {
  id: string;
  code: string;
  name: string;
};

export interface CustomerFuelSurchargeRow {
  id: string;
  fromDate: string;
  toDate: string;
  vendor: string | null;
  service: string | null;
  percentage: string;
  product: { id: string; code: string; name: string } | null;
  destination: { id: string; code: string; name: string } | null;
}

export interface CustomerChargeRow {
  id: string;
  charge: { id: string; code: string; name: string };
  fromDate: string;
  toDate: string;
  vendor: string | null;
  service: string | null;
  valueType: "PERCENTAGE" | "AMOUNT";
  value: string;
  minimumValue: string | null;
  product: { id: string; code: string; name: string } | null;
  origin: { id: string; code: string; name: string } | null;
  destination: { id: string; code: string; name: string } | null;
}

export interface CustomerVolumetricRow {
  id: string;
  vendor: string | null;
  service: string | null;
  cft: string;
  centimetreDivide: string;
  inchDivide: string;
  product: { id: string; code: string; name: string } | null;
}

export interface CustomerContactRow {
  id: string;
  contactType: string;
  fromDate: string;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string;
  city: string | null;
  pinCode: string;
  defaultShipper: boolean;
  [key: string]: unknown;
}

export const getCustomers = (query: string) =>
  get<CustomerPage>(`/api/v1/masters/customers?${query}`);
export const getCustomer = (id: string) => get<Customer>(`/api/v1/masters/customers/${id}`);
export const getCustomerFuelSurcharges = (id: string) =>
  get<CustomerFuelSurchargeRow[]>(`/api/v1/masters/customers/${id}/fuel-surcharges`);
export const getCustomerCharges = (id: string) =>
  get<CustomerChargeRow[]>(`/api/v1/masters/customers/${id}/charges`);
export const getCustomerVolumetrics = (id: string) =>
  get<CustomerVolumetricRow[]>(`/api/v1/masters/customers/${id}/volumetrics`);
export const getCustomerContacts = (id: string) =>
  get<CustomerContactRow[]>(`/api/v1/masters/customers/${id}/contacts`);

export interface Consignee {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  pinCode: string | null;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  telephone1: string | null;
  telephone2: string | null;
  fax: string | null;
  email: string | null;
  mobile: string | null;
  industry: string | null;
  eori: string | null;
  vat: string | null;
  isActive: boolean;
  destination: { id: string; code: string; name: string } | null;
  serviceCentre: { id: string; code: string; name: string } | null;
}

export interface ConsigneePage {
  rows: Consignee[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface Shipper {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  pinCode: string | null;
  city: string | null;
  stateCode: string | null;
  countryCode: string;
  telephone1: string | null;
  telephone2: string | null;
  fax: string | null;
  email: string | null;
  mobile: string | null;
  industry: string | null;
  gstin: string | null;
  aadhaar: string | null;
  pan: string | null;
  iecNo: string | null;
  bankAdCode: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  firm: "GOVT" | "NON_GOVT" | null;
  lutNumber: string | null;
  lutIssueDate: string | null;
  lutTillDate: string | null;
  nfei: boolean;
  isActive: boolean;
  origin: { id: string; code: string; name: string } | null;
  serviceCentre: { id: string; code: string; name: string } | null;
}

export interface ShipperPage {
  rows: Shipper[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface AccountGroup {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  childCount: number;
  parent: { id: string; code: string; name: string } | null;
}

export interface LookupRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sequence: number;
  isActive: boolean;
}

export const getLookups = (kind: string) =>
  get<LookupRow[]>(`/api/v1/masters/lookups/${kind}`);

export interface PinCode {
  id: string;
  code: string;
  city: string | null;
  area: string | null;
  stateCode: string | null;
  countryCode: string;
  oda: boolean;
  isActive: boolean;
  destination: { id: string; code: string; name: string } | null;
  zone: { id: string; code: string; name: string } | null;
}

export interface PinCodePage {
  rows: PinCode[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const getPinCodes = (query: string) =>
  get<PinCodePage>(`/api/v1/masters/pin-codes?${query}`);

export interface RateLine {
  id: string;
  lineType: "UPTO" | "INITIAL" | "ADDITIONAL" | "PLUS" | "PLUSKG";
  weight: string;
  rate: string;
}

export interface Rate {
  id: string;
  kind: "SELL" | "BUY";
  effectiveFrom: string;
  effectiveTo: string | null;
  unit: "KGS" | "LBS";
  days: number | null;
  vendor: string | null;
  service: string | null;
  countryCode: string | null;
  awbCharge: string | null;
  isActive: boolean;
  customer: { id: string; code: string; name: string } | null;
  product: { id: string; code: string; name: string } | null;
  origin: { id: string; code: string; name: string } | null;
  destination: { id: string; code: string; name: string } | null;
  zone: { id: string; code: string; name: string } | null;
  lines: RateLine[];
}

export interface RatePage {
  rows: Rate[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const getRates = (query: string) => get<RatePage>(`/api/v1/masters/rates?${query}`);

export const getAccountGroups = () => get<AccountGroup[]>("/api/v1/masters/account-groups");

export const getShippers = (query: string) => get<ShipperPage>(`/api/v1/masters/shippers?${query}`);
export const getShipper = (id: string) => get<Shipper>(`/api/v1/masters/shippers/${id}`);

export const getConsignees = (query: string) =>
  get<ConsigneePage>(`/api/v1/masters/consignees?${query}`);
export const getConsignee = (id: string) => get<Consignee>(`/api/v1/masters/consignees/${id}`);

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

/**
 * Null when there is no session, so the layout can send the reader to sign
 * in — and only then. An API outage throws instead, because redirecting to
 * the sign-in page during an outage tells a signed-in person they were
 * signed out, and the sign-in form then fails for a reason it cannot name.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const result = await getResult<CurrentSession>("/api/v1/auth/me");
  if (result.ok) return result.data;
  if (result.error.isUnauthenticated) return null;
  throw result.error instanceof ApiUnavailableError
    ? result.error
    : new ApiUnavailableError(result.error.status, null, "/api/v1/auth/me");
}

export async function getDashboardSummary(): Promise<DashboardSummary | null> {
  return get<DashboardSummary>("/api/v1/dashboard/summary");
}

// ── System: cache ──────────────────────────────────────────────────────────

export interface CacheNamespaceOverview {
  name: string;
  label: string;
  description: string;
  ttlSeconds: number;
  keys: number;
  approximate: boolean;
  hits: number;
  misses: number;
  hitRate: number | null;
}

export interface CacheRedisHealth {
  ok: boolean;
  pingMs: number | null;
  version?: string;
  uptimeSeconds?: number;
  usedMemoryBytes?: number;
  usedMemoryHuman?: string;
  maxMemoryBytes?: number;
  evictedKeys?: number;
  keyspaceHits?: number;
  keyspaceMisses?: number;
  connectedClients?: number;
  totalKeys?: number;
}

export interface CacheOverview {
  redis: CacheRedisHealth;
  namespaces: CacheNamespaceOverview[];
  platform: CacheNamespaceOverview[];
  inProcess: { actorCache: { entries: number; ttlMs: number; maxEntries: number } };
  queuePrefixKeys: number;
}

export interface CacheKeyRow {
  key: string;
  ttlSeconds: number | null;
  bytes: number | null;
}

export interface CacheKeyPage {
  keys: CacheKeyRow[];
  cursor: string | null;
}

export interface CacheKeyValue extends CacheKeyRow {
  value: unknown;
}

export const getCacheOverview = () => get<CacheOverview>("/api/v1/system/cache");
export const getCacheKeys = (namespace: string, query: string) =>
  get<CacheKeyPage>(`/api/v1/system/cache/${encodeURIComponent(namespace)}/keys?${query}`);
export const getCacheKey = (namespace: string, key: string) =>
  get<CacheKeyValue>(
    `/api/v1/system/cache/${encodeURIComponent(namespace)}/keys/${encodeURIComponent(key)}`,
  );

// ── System: performance ────────────────────────────────────────────────────

export interface PerformanceRoute {
  route: string;
  method: string;
  count: number;
  errors: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  max: number;
}

export interface PerformanceModel {
  model: string;
  count: number;
  operations: Record<string, number>;
  p50: number;
  p95: number;
  avg: number;
  totalMs: number;
  slowCount: number;
}

export interface PerformanceOverview {
  instance: string;
  scope: "instance";
  process: {
    pid: number;
    node: string;
    uptimeSeconds: number;
    startedAt: string;
    activeHandles: number;
    activeRequests: number;
    memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  };
  eventLoop: { p50: number; p99: number; max: number };
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number };
  cpu: { percent: number };
  inFlight: number;
  http: {
    windowMinutes: 5 | 15 | 60;
    requests: number;
    rps: number;
    errors4xx: number;
    errors5xx: number;
    errorRate: number;
    p50: number;
    p95: number;
    p99: number;
    max: number;
    avg: number;
    byRoute: PerformanceRoute[];
    slowestByAvg: PerformanceRoute[];
    mostErrors: PerformanceRoute[];
    perMinute: Array<{ minute: string; count: number; errors: number; p95: number }>;
  };
  db: {
    queries: number;
    p50: number;
    p95: number;
    totalMs: number;
    slowCount: number;
    perModel: PerformanceModel[];
  };
  redis: { pingMs: number | null; ok: boolean };
  database: { pingMs: number | null; ok: boolean };
  queues: Array<{
    queue: string;
    paused: boolean;
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
    completed?: number;
    prioritized?: number;
  }>;
  jobs: { succeeded: number; failed: number; p95: number; avg: number };
  since: string;
  generatedAt: string;
}

export interface PerformanceHealth {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; ms: number | null; detail: string }>;
  instance: string;
  metricsPath: string;
  metricsProtected: boolean;
  generatedAt: string;
}

export const getPerformanceOverview = (query: string) =>
  get<PerformanceOverview>(`/api/v1/system/performance?${query}`);
export const getPerformanceHealth = () =>
  get<PerformanceHealth>("/api/v1/system/performance/health");
export const getPerformanceRoutes = (query: string) =>
  get<{ window: number; sort: string; routes: PerformanceRoute[] }>(
    `/api/v1/system/performance/routes?${query}`,
  );

// ── System: activity log ───────────────────────────────────────────────────

export interface ActivityActor {
  id: string;
  fullName: string;
  email: string;
}

export interface ActivityRow {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  entity: string | null;
  entityId: string | null;
  actor: ActivityActor | null;
  ip: string | null;
  requestId: string | null;
  hasMetadata: boolean;
}

export interface ActivityDetail extends ActivityRow {
  metadata: unknown;
  userAgent: string | null;
}

export interface ActivityPage {
  rows: ActivityRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ActivityFacets {
  domains: Array<{ domain: string; actions: Array<{ action: string; label: string; count: number }> }>;
  entities: string[];
  actors: Array<{ actor: ActivityActor; count: number }>;
}

export interface ActivitySummary {
  window: { days: number; from: string; to: string };
  totals: { events: number; actors: number; perDay: Array<{ day: string; count: number }> };
  topActions: Array<{ action: string; label: string; count: number }>;
  topActors: Array<{ actor: ActivityActor | null; count: number }>;
  byDomain: Array<{ domain: string; count: number }>;
}

export const getActivity = (query: string) => get<ActivityPage>(`/api/v1/system/activity?${query}`);
export const getActivityDetail = (id: string) =>
  get<ActivityDetail>(`/api/v1/system/activity/${encodeURIComponent(id)}`);
export const getActivityFacets = () => get<ActivityFacets>("/api/v1/system/activity/facets");
export const getActivitySummary = (days = 7) =>
  get<ActivitySummary>(`/api/v1/system/activity/summary?days=${days}`);

// ── System: login history ──────────────────────────────────────────────────

export type LoginOutcome =
  | "SUCCEEDED"
  | "BAD_PASSWORD"
  | "INACTIVE"
  | "LOCKED"
  | "LOCKED_OUT"
  | "UNKNOWN_USER"
  | "THROTTLED";

export interface LoginDevice {
  browser: string | null;
  os: string | null;
}

export interface LoginAttemptRow {
  id: string;
  createdAt: string;
  email: string;
  user: { id: string; fullName: string; email: string; isActive: boolean; lockedUntil: string | null } | null;
  outcome: LoginOutcome;
  ip: string | null;
  userAgent: string | null;
  device: LoginDevice;
  host: string;
  sessionId: string | null;
  sessionActive: boolean;
}

export interface LoginHistoryPage {
  rows: LoginAttemptRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface LoginHistorySummary {
  window: { days: number; from: string; to: string };
  totals: {
    attempts: number;
    succeeded: number;
    failed: number;
    lockedOut: number;
    uniqueUsers: number;
    uniqueIps: number;
  };
  byDay: Array<{ day: string; succeeded: number; failed: number }>;
  topFailingEmails: Array<{ email: string; count: number }>;
  topIps: Array<{ ip: string; count: number }>;
  currentlyLocked: Array<{
    id: string;
    fullName: string;
    email: string;
    lockedUntil: string;
    failedLoginAttempts: number;
  }>;
  activeSessions: number;
}

export interface UserLoginHistory {
  user: { id: string; fullName: string; email: string; isActive: boolean; lockedUntil: string | null };
  attempts: LoginAttemptRow[];
  activeSessions: Array<{
    id: string;
    ip: string | null;
    userAgent: string | null;
    device: LoginDevice;
    createdAt: string;
    idleExpiresAt: string;
  }>;
}

export const getLoginHistory = (query: string) =>
  get<LoginHistoryPage>(`/api/v1/system/login-history?${query}`);
export const getLoginHistorySummary = (days = 7) =>
  get<LoginHistorySummary>(`/api/v1/system/login-history/summary?days=${days}`);
export const getUserLoginHistory = (userId: string) =>
  get<UserLoginHistory>(`/api/v1/system/login-history/users/${encodeURIComponent(userId)}`);

// ── System: queue monitor ──────────────────────────────────────────────────

export interface QueueLive {
  queue: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
  prioritized: number;
  paused: boolean;
  concurrency: number;
}

export interface QueuesLive {
  queues: QueueLive[];
  handlers: string[];
  concurrency: Record<string, number>;
}

export interface QueueWindowStats {
  queue: string;
  name: string | null;
  succeeded: number;
  failed: number;
  cancelled: number;
  avgMs: number | null;
  p95Ms: number | null;
}

export interface QueueSummary {
  generatedAt: string;
  last24h: QueueWindowStats[];
  last7d: QueueWindowStats[];
  throughput: Array<{ queue: string; hours: Array<{ hour: string; succeeded: number; failed: number }> }>;
  oldestWaiting: Record<string, { since: string; ageMs: number } | null>;
}

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface JobRow {
  id: string;
  queue: string;
  name: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
  scheduleId: string | null;
  requestedById: string | null;
  requestedBy: { fullName: string; email: string } | null;
  createdAt: string;
}

export interface JobPage {
  rows: JobRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface JobDetail extends JobRow {
  payload: unknown;
  result: unknown;
  updatedAt: string;
  live: {
    state: string;
    progress: unknown;
    attemptsMade: number;
    failedReason: string | null;
    processedOn: string | null;
    finishedOn: string | null;
    delay: number;
  } | null;
}

export const getQueuesLive = () => get<QueuesLive>("/api/v1/system/queues");
export const getQueueSummary = () => get<QueueSummary>("/api/v1/system/queues/summary");
export const getJobs = (query: string) => get<JobPage>(`/api/v1/system/jobs?${query}`);
export const getJob = (id: string) => get<JobDetail>(`/api/v1/system/jobs/${encodeURIComponent(id)}`);

// ── System: scheduler ──────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  name: string;
  description: string | null;
  queue: string;
  jobName: string;
  cron: string;
  timezone: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: JobStatus | null;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SchedulePage {
  rows: Schedule[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ScheduleDetail extends Schedule {
  runs: JobRow[];
}

export interface ScheduleOptions {
  jobNames: Array<{ name: string; description: string }>;
  queues: string[];
  timezones: string[];
}

export interface SchedulerStatus {
  enabled: boolean;
  isLeader: boolean;
  lastTickAt: string | null;
  nextTickAt: string | null;
  tickMs: number;
  dueCount: number;
}

export const getSchedules = (query: string) => get<SchedulePage>(`/api/v1/system/schedules?${query}`);
export const getSchedule = (id: string) =>
  get<ScheduleDetail>(`/api/v1/system/schedules/${encodeURIComponent(id)}`);
export const getScheduleOptions = () => get<ScheduleOptions>("/api/v1/system/schedules/options");
export const getSchedulerStatus = () => get<SchedulerStatus>("/api/v1/system/scheduler/status");

// ── Settings: outgoing mail ─────────────────────────────────────────────────

export interface MailSettings {
  provider: "PLATFORM" | "SMTP";
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUsername: string | null;
  hasPassword: boolean;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string | null;
  platformFrom: { name: string; email: string };
}

export interface MailMessageRow {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: "QUEUED" | "SENT" | "FAILED";
  attempts: number;
  error: string | null;
  reference: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface MailMessagePage {
  rows: MailMessageRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const getMailSettings = () => get<MailSettings>("/api/v1/settings/mail");
export const getMailMessages = (query: string) => get<MailMessagePage>(`/api/v1/settings/mail/messages?${query}`);

// ── Notifications ───────────────────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  kind: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  body: string;
  href: string | null;
  entity: { type: string; id: string | null } | null;
  emailed: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  rows: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const getNotifications = (query: string) => get<NotificationPage>(`/api/v1/notifications?${query}`);
