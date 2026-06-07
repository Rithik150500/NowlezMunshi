const BASE = "/api";
const TOKEN_KEY = "nowlez.token";

// The opaque bearer token (ADR-0019) is kept in localStorage so a reload keeps the session, with an
// in-memory fallback for environments where storage is unavailable. It is attached to every request;
// a 401 clears it and notifies the app, which drops back to the login screen.
let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function getToken(): string | null {
  if (memoryToken !== null) {
    return memoryToken;
  }
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // The in-memory copy still serves this session.
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Register a callback fired when the API rejects the session (401), so the app can show login. */
export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Thrown on a 401 — the session is missing or expired; the token has already been cleared. */
export class UnauthorizedError extends Error {
  constructor() {
    super("HTTP 401");
    this.name = "UnauthorizedError";
  }
}

/** On a 401, clear the token and notify the app before the caller's error path runs. */
function rejectOn401(status: number): void {
  if (status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new UnauthorizedError();
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...authHeaders(), ...init?.headers },
  });
  if (!response.ok) {
    rejectOn401(response.status);
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

// --- Auth & identity (ADR-0019): the three sign-in methods + session lifecycle over /auth ---

/** A session as the server returns it (`/auth/login`, `/auth/otp/verify`, `/auth/google`, register). */
export interface Session {
  readonly token: string;
  readonly expiresAt: string;
  readonly userId: string;
  readonly firmId: string;
  readonly role: string;
  /** The role's permissions — used to hide actions the role can't perform (RBAC). */
  readonly permissions: readonly string[];
}

/** The authenticated principal `/auth/me` resolves a token to (with the role's permissions). */
export interface Principal {
  readonly userId: string;
  readonly firmId: string;
  readonly role: string;
  readonly permissions: readonly string[];
}

export interface RegisterInput {
  readonly firmName: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly password?: string;
}

/** Sign-up: create a firm + its principal user; returns a session (already authenticated). */
export const register = (input: RegisterInput): Promise<Session> =>
  http("/auth/register", { method: "POST", body: JSON.stringify(input) });

export const loginWithPassword = (email: string, password: string): Promise<Session> =>
  http("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });

/** Request a one-time code for a phone (always resolves ok — no phone enumeration). */
export const requestOtp = (phone: string): Promise<{ ok: boolean }> =>
  http("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) });

export const verifyOtp = (phone: string, code: string): Promise<Session> =>
  http("/auth/otp/verify", { method: "POST", body: JSON.stringify({ phone, code }) });

/** Exchange a Google ID token (from the GIS client) for a session. */
export const loginWithGoogle = (idToken: string): Promise<Session> =>
  http("/auth/google", { method: "POST", body: JSON.stringify({ idToken }) });

export const me = (): Promise<Principal> => http("/auth/me");

export const logout = (): Promise<{ ok: boolean }> => http("/auth/logout", { method: "POST" });

export interface FileSummary {
  readonly id: string;
  readonly documentType: string;
  readonly summary: string;
  readonly origin: string;
  readonly original: { readonly contentType: string };
}

export interface OrderSummary {
  readonly id: string;
  readonly summary: string;
}

export interface CaseDetails {
  readonly parties?: string;
  readonly caseType?: string;
  readonly caseNumber?: string;
  readonly year?: number;
  readonly filingDate?: string;
  readonly registrationDate?: string;
  readonly status?: string;
  readonly nextHearingDate?: string;
}

export interface CaseSummary {
  readonly cnr: string;
  readonly court: { readonly court: string };
  readonly details: CaseDetails;
  readonly orders: readonly OrderSummary[];
  readonly files: readonly FileSummary[];
  readonly tracking: boolean;
  readonly clientId?: string;
}

/** Download a stored File's bytes (served as an attachment). */
export const fileDownloadUrl = (fileId: string): string => `${BASE}/files/${fileId}`;

/** View a stored File inline in the browser (the document viewer). */
export const fileViewUrl = (fileId: string): string => `${BASE}/files/${fileId}?disposition=inline`;

/** Extract a stored .docx File's text (the doc/docx preview; renderer is deferred). */
export const fileText = (fileId: string): Promise<{ text: string }> =>
  http(`/files/${encodeURIComponent(fileId)}/text`);

export type Citation =
  | { readonly kind: "cnr"; readonly cnr: string }
  | { readonly kind: "order"; readonly orderId: string; readonly page: number }
  | { readonly kind: "file"; readonly fileId: string; readonly page: number }
  | { readonly kind: "url"; readonly url: string };

export interface MunshiToolInvocation {
  readonly name: string;
  readonly ok: boolean;
}

export interface MunshiReply {
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly toolCalls: readonly MunshiToolInvocation[];
}

/** Turn tracking on/off for a case (the daily-refresh subscription). */
export const setTracking = (cnr: string, tracking: boolean): Promise<{ ok: boolean }> =>
  http(`/cases/${encodeURIComponent(cnr)}/tracking`, {
    method: "POST",
    body: JSON.stringify({ tracking }),
  });

export const listCases = (): Promise<CaseSummary[]> => http("/cases");

export const addCase = (cnr: string): Promise<CaseSummary> =>
  http("/cases", { method: "POST", body: JSON.stringify({ cnr }) });

export const refreshCases = (): Promise<unknown[]> => http("/refresh", { method: "POST" });

export interface AlertSummary {
  readonly id: string;
  readonly cnr: string;
  readonly kind: string;
  readonly message: string;
  readonly read: boolean;
}

export const listAlerts = (): Promise<AlertSummary[]> => http("/alerts");

export const markAlertRead = (id: string): Promise<{ ok: boolean }> =>
  http(`/alerts/${encodeURIComponent(id)}/read`, { method: "POST" });

export interface CauseListEntry {
  readonly date: string;
  readonly cnr?: string;
  readonly caseNumber?: string;
  readonly parties?: string;
  readonly item?: string;
  readonly purpose?: string;
}

/** The court's cause list for a date, cross-referenced to the user's tracked cases. */
export const getCauseList = (date: string): Promise<CauseListEntry[]> =>
  http(`/cause-list?date=${encodeURIComponent(date)}`);

export type HearingBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "unscheduled";

export interface HearingEntry {
  readonly cnr: string;
  readonly court: { readonly court: string };
  readonly parties?: string;
  readonly caseNumber?: string;
  readonly nextHearingDate?: string;
  readonly date?: string;
  readonly daysUntil?: number;
  readonly bucket: HearingBucket;
}

export interface HearingDigest {
  readonly today: string;
  readonly horizonDays: number;
  readonly entries: readonly HearingEntry[];
  readonly counts: Record<HearingBucket, number>;
}

/** The upcoming-hearings digest across the caseload (never-miss-a-hearing). */
export const getHearings = (): Promise<HearingDigest> => http("/hearings");

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly notes?: string;
}

export const listClients = (): Promise<Client[]> => http("/clients");

export const createClient = (input: {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}): Promise<Client> => http("/clients", { method: "POST", body: JSON.stringify(input) });

/** Assign a case to a client, or pass null to clear the assignment. */
export const assignCaseClient = (cnr: string, clientId: string | null): Promise<{ ok: boolean }> =>
  http(`/cases/${encodeURIComponent(cnr)}/client`, {
    method: "POST",
    body: JSON.stringify({ clientId: clientId ?? undefined }),
  });

/** Send the composed client update to the client over WhatsApp. */
export const notifyClient = (clientId: string): Promise<{ sent: boolean; to: string }> =>
  http(`/clients/${encodeURIComponent(clientId)}/notify`, { method: "POST" });

export type DeadlineBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later";

export interface Deadline {
  readonly id: string;
  readonly cnr: string;
  readonly title: string;
  readonly dueDate: string;
  readonly rule?: string;
  readonly notes?: string;
  readonly done: boolean;
}

export interface DeadlineEntry {
  readonly deadline: Deadline;
  readonly daysUntil: number;
  readonly bucket: DeadlineBucket;
}

export interface DeadlineDigest {
  readonly today: string;
  readonly horizonDays: number;
  readonly entries: readonly DeadlineEntry[];
  readonly counts: Record<DeadlineBucket, number>;
}

export interface LimitationRule {
  readonly id: string;
  readonly label: string;
  readonly days: number;
}

/** The PROVISIONAL limitation-rule catalogue (illustrative; needs legal sign-off). */
export const listLimitationRules = (): Promise<LimitationRule[]> => http("/limitation-rules");

/** The upcoming-deadlines digest across the caseload. */
export const getDeadlines = (): Promise<DeadlineDigest> => http("/deadlines");

export const getCaseDeadlines = (cnr: string): Promise<Deadline[]> =>
  http(`/cases/${encodeURIComponent(cnr)}/deadlines`);

export interface CreateDeadlineInput {
  readonly title: string;
  /** An explicit due date, OR a `rule` + `baseDate` for the server to compute it. */
  readonly dueDate?: string;
  readonly rule?: string;
  readonly baseDate?: string;
}

export const createDeadline = (cnr: string, input: CreateDeadlineInput): Promise<Deadline> =>
  http(`/cases/${encodeURIComponent(cnr)}/deadlines`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const completeDeadline = (id: string): Promise<{ ok: boolean }> =>
  http(`/deadlines/${encodeURIComponent(id)}/done`, { method: "POST" });

/** Generate a hearing-prep brief for a case (runs the Munshi); returns a cited reply. */
export const prepBrief = (cnr: string): Promise<MunshiReply> =>
  http(`/cases/${encodeURIComponent(cnr)}/prep-brief`, { method: "POST" });

export interface CourtScope {
  readonly stateOrHighCourt: string;
  readonly districtOrBench?: string;
  readonly court?: string;
}

export interface CaseSearchResult {
  readonly cnr: string;
  readonly parties: string;
  readonly court: { readonly court: string };
  readonly caseType?: string;
  readonly caseNumber?: string;
  readonly year?: number;
}

/** Discover cases at eCourts by party name (scoped through the court hierarchy). */
export const searchByParty = (query: {
  scope: CourtScope;
  partyName: string;
  year: number;
}): Promise<CaseSearchResult[]> =>
  http("/search/party", { method: "POST", body: JSON.stringify(query) });

/** Discover cases at eCourts by case number (type + number + year). */
export const searchByCaseNumber = (query: {
  scope: CourtScope;
  caseType: string;
  caseNumber: string;
  year: number;
}): Promise<CaseSearchResult[]> =>
  http("/search/case-number", { method: "POST", body: JSON.stringify(query) });

export const askMunshi = (message: string): Promise<MunshiReply> =>
  http("/munshi", { method: "POST", body: JSON.stringify({ message }) });

/** Upload a document to a case (multipart). Returns the new File's id. */
export async function uploadFile(
  cnr: string,
  file: File,
  documentType = "uploaded",
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("documentType", documentType);
  // No content-type: the browser sets the multipart boundary. The bearer token still rides along.
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(cnr)}/files`, {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });
  if (!res.ok) {
    rejectOn401(res.status);
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as { id: string };
}

/** Run ingestion on a stored File (normalise → classify → fill its summary/type). */
export const ingestFile = (fileId: string): Promise<{ documentType: string; summary: string }> =>
  http(`/files/${encodeURIComponent(fileId)}/ingest`, { method: "POST" });

/** Ingest a case's not-yet-summarised orders (fills their summaries). */
export const ingestCase = (cnr: string): Promise<{ ingested: number }> =>
  http(`/cases/${encodeURIComponent(cnr)}/ingest`, { method: "POST" });
