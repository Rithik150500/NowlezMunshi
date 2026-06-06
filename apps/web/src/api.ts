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
}

export interface CaseSummary {
  readonly cnr: string;
  readonly court: { readonly court: string };
  readonly orders: readonly unknown[];
  readonly files: readonly FileSummary[];
  readonly tracking: boolean;
}

/** A direct link to download a stored File's bytes (the server streams it as an attachment). */
export const fileDownloadUrl = (fileId: string): string => `${BASE}/files/${fileId}`;

export interface MunshiReply {
  readonly text: string;
  readonly citations: readonly { readonly kind: string }[];
}

export const listCases = (): Promise<CaseSummary[]> => http("/cases");

export const addCase = (cnr: string): Promise<CaseSummary> =>
  http("/cases", { method: "POST", body: JSON.stringify({ cnr }) });

export const refreshCases = (): Promise<unknown[]> => http("/refresh", { method: "POST" });

export const askMunshi = (message: string): Promise<MunshiReply> =>
  http("/munshi", { method: "POST", body: JSON.stringify({ message }) });

/** Upload a document to a case (multipart). The server stores it and attaches a user File. */
export async function uploadFile(
  cnr: string,
  file: File,
  documentType = "uploaded",
): Promise<void> {
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
}
