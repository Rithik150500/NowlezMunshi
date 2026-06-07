import type {
  Alert,
  AuthPrincipal,
  Case,
  CaseNumberSearchQuery,
  CaseSearchResult,
  CauseListEntry,
  PartySearchQuery,
  Session,
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
  /** A persisted session token to start authenticated (the RN shell restores it on launch). */
  readonly token?: string;
}

/**
 * A typed client for the NowLez HTTP API (ADR-0011), shared by any front-end. Transport is
 * injectable so it is fully testable without a network and works under React Native.
 */
export class NowlezClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  /** The opaque bearer token (ADR-0019); attached to every request once signed in. */
  private token: string | undefined;

  constructor(options: NowlezClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "/api";
    this.doFetch = options.fetch ?? fetch;
    this.token = options.token;
  }

  /** The current session token, if signed in (the RN shell persists it across launches). */
  getToken(): string | undefined {
    return this.token;
  }
  setToken(token: string): void {
    this.token = token;
  }
  clearToken(): void {
    this.token = undefined;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.doFetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        ...init?.headers,
      },
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

  // --- Auth & identity (ADR-0019): the three sign-in methods + session lifecycle ---

  /** Sign-up: create a firm + its principal user. Stores the returned session token. */
  register(input: {
    firmName: string;
    name: string;
    email?: string;
    phone?: string;
    password?: string;
  }): Promise<Session> {
    return this.authenticate("/auth/register", input);
  }
  /** Email + password sign-in. Stores the returned session token. */
  loginWithPassword(email: string, password: string): Promise<Session> {
    return this.authenticate("/auth/login", { email, password });
  }
  /** Request a one-time code for a phone (always resolves ok — no phone enumeration). */
  async requestOtp(phone: string): Promise<void> {
    await this.json("/auth/otp/request", { method: "POST", body: JSON.stringify({ phone }) });
  }
  /** Verify a phone OTP. Stores the returned session token. */
  verifyOtp(phone: string, code: string): Promise<Session> {
    return this.authenticate("/auth/otp/verify", { phone, code });
  }
  /** Exchange a Google ID token (from the device's Google sign-in) for a session. */
  loginWithGoogle(idToken: string): Promise<Session> {
    return this.authenticate("/auth/google", { idToken });
  }
  /** Resolve the current token to its principal (throws 401 when unauthenticated). */
  me(): Promise<AuthPrincipal> {
    return this.json("/auth/me");
  }
  /** Revoke the current session and forget the token. */
  async logout(): Promise<void> {
    await this.json("/auth/logout", { method: "POST" });
    this.clearToken();
  }
  /** POST a credential body, store the issued session token, and return the session. */
  private async authenticate(path: string, body: unknown): Promise<Session> {
    const session = await this.json<Session>(path, { method: "POST", body: JSON.stringify(body) });
    this.setToken(session.token);
    return session;
  }

  /** A direct URL to a stored file's bytes (download). */
  fileDownloadUrl(fileId: string): string {
    return `${this.baseUrl}/files/${encodeURIComponent(fileId)}`;
  }
}
