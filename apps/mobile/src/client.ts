import type {
  Alert,
  Case,
  CaseNumberSearchQuery,
  CaseSearchResult,
  CauseListEntry,
  PartySearchQuery,
} from "@nowlez/contracts";

/** The Munshi's reply as the HTTP API serializes it (citations are the input shape). */
export interface MunshiReply {
  readonly text: string;
  readonly citations: readonly { readonly kind: string }[];
  readonly toolCalls: readonly { readonly name: string; readonly ok: boolean }[];
}

export interface NowlezClientOptions {
  /** API base. Default `/api` (web proxy); the mobile shell points it at the server URL. */
  readonly baseUrl?: string;
  /** Injectable fetch for tests / RN; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
}

/**
 * A typed client for the NowLez HTTP API (ADR-0011), shared by any front-end. Transport is
 * injectable so it is fully testable without a network and works under React Native.
 */
export class NowlezClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(options: NowlezClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    this.doFetch = options.fetch ?? fetch;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.doFetch(`${this.baseUrl}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  listCases(): Promise<Case[]> {
    return this.json("/cases");
  }
  getCase(cnr: string): Promise<Case> {
    return this.json(`/cases/${encodeURIComponent(cnr)}`);
  }
  addCase(cnr: string): Promise<Case> {
    return this.json("/cases", { method: "POST", body: JSON.stringify({ cnr }) });
  }
  async setTracking(cnr: string, tracking: boolean): Promise<void> {
    await this.json(`/cases/${encodeURIComponent(cnr)}/tracking`, {
      method: "POST",
      body: JSON.stringify({ tracking }),
    });
  }
  listAlerts(): Promise<Alert[]> {
    return this.json("/alerts");
  }
  async markAlertRead(id: string): Promise<void> {
    await this.json(`/alerts/${encodeURIComponent(id)}/read`, { method: "POST" });
  }
  causeList(date: string): Promise<CauseListEntry[]> {
    return this.json(`/cause-list?date=${encodeURIComponent(date)}`);
  }
  searchByParty(query: PartySearchQuery): Promise<CaseSearchResult[]> {
    return this.json("/search/party", { method: "POST", body: JSON.stringify(query) });
  }
  searchByCaseNumber(query: CaseNumberSearchQuery): Promise<CaseSearchResult[]> {
    return this.json("/search/case-number", { method: "POST", body: JSON.stringify(query) });
  }
  askMunshi(message: string): Promise<MunshiReply> {
    return this.json("/munshi", { method: "POST", body: JSON.stringify({ message }) });
  }
  /** A direct URL to a stored file's bytes (download). */
  fileDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/files/${encodeURIComponent(fileId)}`;
  }
}
