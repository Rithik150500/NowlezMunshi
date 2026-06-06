const BASE = "/api";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

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
}

/** Download a stored File's bytes (served as an attachment). */
export const fileDownloadUrl = (fileId: string): string => `${BASE}/files/${fileId}`;

/** View a stored File inline in the browser (the document viewer). */
export const fileViewUrl = (fileId: string): string => `${BASE}/files/${fileId}?disposition=inline`;

/** Extract a stored .docx File's text (the doc/docx preview; renderer is deferred). */
export const fileText = (fileId: string): Promise<{ text: string }> =>
  http(`/files/${encodeURIComponent(fileId)}/text`);

export interface MunshiReply {
  readonly text: string;
  readonly citations: readonly { readonly kind: string }[];
}

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
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(cnr)}/files`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
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
