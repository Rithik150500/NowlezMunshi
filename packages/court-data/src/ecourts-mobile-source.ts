/**
 * The eCourts **Services mobile-app** CourtDataSource (ADR-0004, ADR-0016).
 *
 * The wire protocol below is VERIFIED by the 2026-06-07 static teardown of the official eCourts
 * Services APK (docs/research/2026-06-07-ecourts-apk-teardown.md) — a Cordova/WebView app whose
 * request logic is plain JS (`assets/www/js/main.js` for District Courts, `main_hc.js` for High
 * Courts). Confirmed facts, all reproduced here:
 *   • base: `https://app.ecourts.gov.in/ecourt_mobile_DC/` (DC) or `…/ecourt_mobile_HC/` (HC);
 *   • the session JWT is minted via an UNAUTHENTICATED `appReleaseWebService.php` bootstrap
 *     (`{version, uid:<uuid>:<pkg>}`) — without it the backend under-privileges search (returns only
 *     `no_of_establishments`). See `ensureSession`; this matches the reference `ecourts_client`;
 *   • each call is `GET {base}{endpoint}.php?params=<blob>` where <blob> is the AES request
 *     encryption (see {@link EcourtsCodec}) of `JSON.stringify(paramObject)`, with
 *     `Authorization: Bearer <encrypt(jwt)>` (a one-shot 401→uid retry as fallback);
 *   • the response is plaintext JSON (errors) or an AES-encrypted envelope (success), decoded by the
 *     codec, then JSON-parsed.
 * Verified endpoints + shapes: case-history (`caseHistoryWebService.php`, CNR as `cinum`, under
 * `history`); search (`showDataWebService.php` / `caseNumberSearch.php` with `court_code_arr`,
 * returning numeric-keyed establishment buckets → flattened); cause-list
 * (`cases_new.php`, the court-daily HTML table, fetched per courtroom for the civil + criminal
 * radios, then parsed). The `courtNo` (courtroom) is caller-supplied — eCourts has no DC enumerator.
 *
 * Speaking this protocol against the live government backend is an operator-owned decision: this
 * source is OFF by default (selected only via NOWLEZ_COURT_SOURCE=ecourts-mobile) and live use is
 * gated on legal/compliance sign-off (open-questions.md#ecourts-integration,
 * docs/runbooks/ecourts-mitm-and-codec.md).
 */
import {
  asCnr,
  asOrderId,
  type CaseDetails,
  type CaseNumberSearchQuery,
  type CaseSearchResult,
  type CauseListEntry,
  type CauseListQuery,
  type Cnr,
  type CourtDataSource,
  type CourtHierarchy,
  type CourtScope,
  type FetchedCase,
  type FetchedOrder,
  type PartySearchQuery,
  type SourceId,
} from "@nowlez/contracts";
import { createEcourtsCodec, type EcourtsCodec } from "./ecourts-codec";
import {
  type EcourtsTransport,
  ecourtsRequest,
  ecourtsRoundTrip,
  makeEcourtsTransport,
} from "./ecourts-protocol";
import {
  caseHistoryRequest,
  caseNumberSearchRequest,
  causesNewRequest,
  ecourtsUid,
  partySearchRequest,
  type RequestFlags,
} from "./ecourts-requests";

// The wire protocol (transport + round-trip) lives in ./ecourts-protocol, and the per-operation
// endpoint + param builders in ./ecourts-requests, so this adapter and the operator capture tool
// share one implementation of each. EcourtsTransport is re-exported for back-compat.
export type { EcourtsTransport } from "./ecourts-protocol";

/** Default host+app-path for District Courts (verified). Override per deployment via NOWLEZ_ECOURTS_BASE_URL. */
export const ECOURTS_DEFAULT_BASE_URL = "https://app.ecourts.gov.in/ecourt_mobile_DC/";

/** App version sent in the appReleaseWebService.php session bootstrap (index.js). */
const APP_VERSION = "3.0";

/** eCourts CNR: 4 letters + 12 digits (e.g. KLER010012342026); used to pull a CNR out of a QR payload. */
const CNR_PATTERN = /[A-Za-z]{4}\d{12}/;

export interface EcourtsMobileConfig {
  readonly baseUrl?: string;
  readonly transport?: EcourtsTransport;
  readonly codec?: EcourtsCodec;
  /** Injectable fetch for the default transport (testing); defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Per-request timeout in ms applied by the default transport. Default 30s. */
  readonly timeoutMs?: number;
  /** `language_flag` sent with every request (app default "english"). */
  readonly languageFlag?: string;
  /** `bilingual_flag` sent with every request (app default "0"). */
  readonly bilingualFlag?: string;
  /** Device id for the session `uid` used in the 401 bootstrap (default NOWLEZ_ECOURTS_DEVICE_ID). */
  readonly deviceId?: string;
  /** App package id for the session `uid` (default NOWLEZ_ECOURTS_PACKAGE). */
  readonly packageName?: string;
}

/**
 * Shape of the `caseHistoryWebService.php` `history` object — field names VERIFIED from a 2026-06-07
 * live capture; the `interimOrder` / `finalOrder` order tables are parsed per the reference client's
 * documented columns (see {@link parseOrdersHtml}).
 */
interface RawEcourtsCase {
  readonly cino?: string;
  readonly type_name?: string;
  readonly reg_no?: string | number;
  readonly reg_year?: string | number;
  readonly case_no?: string;
  readonly date_of_filing?: string;
  readonly dt_regis?: string;
  readonly date_next_list?: string;
  readonly date_of_decision?: string | null;
  readonly pet_name?: string;
  readonly res_name?: string;
  readonly petparty_name?: string;
  readonly resparty_name?: string;
  readonly state_name?: string;
  readonly district_name?: string;
  readonly court_name?: string;
  // interimOrder / finalOrder are server-rendered HTML tables (the app appends them to the DOM);
  // parseOrdersHtml turns them into structured orders. (Per-hearing business PDFs are a separate
  // s_show_business.php flow — not yet wired.)
  readonly interimOrder?: string | null;
  readonly finalOrder?: string | null;
}

function joinParties(petitioner?: string, respondent?: string): string | undefined {
  if (petitioner && respondent) {
    return `${petitioner} vs ${respondent}`;
  }
  return petitioner ?? respondent;
}

const ORDER_ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const ORDER_CELL_RE = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const ORDER_HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i;
const ORDER_DATE_RE = /\b\d{2}-\d{2}-\d{4}\b/;

// Cause-list cells: like ORDER_CELL_RE but it CAPTURES the cell attributes too, so we can spot a
// section-header row (a single `colspan`'d cell). The case anchor in a cause list carries the
// uniform case number as `case_no=` and (sometimes) the CNR as `cino=`.
const CAUSE_CELL_RE = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
const CAUSE_COLSPAN_RE = /\bcolspan\b/i;
const CAUSE_CASE_NO_RE = /\bcase_no\s*=\s*["']([^"']+)["']/i;
const CAUSE_CINO_RE = /\bcino\s*=\s*["']([^"']+)["']/i;
const CAUSE_SR_RE = /^\d+$/;

/** Strip HTML tags + entities from a table cell down to its visible text. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse an `interimOrder` / `finalOrder` HTML table into orders. Verified columns (from the reference
 * client's parser): [Order Number | Order Date | Order Details — with an embedded `<a>` to the order
 * PDF]. Rows lacking 3 cells, a DD-MM-YYYY date, or a PDF link are skipped (headers / dividers). A
 * dependency-free targeted parser — the table shape is simple and documented.
 */
function parseOrdersHtml(cnr: Cnr, html: string | null | undefined): FetchedOrder[] {
  if (!html) {
    return [];
  }
  const orders: FetchedOrder[] = [];
  for (const rowMatch of html.matchAll(ORDER_ROW_RE)) {
    const row = rowMatch[1] ?? "";
    const cells = [...row.matchAll(ORDER_CELL_RE)].map((cell) => stripHtml(cell[1] ?? ""));
    const orderNo = cells[0] ?? "";
    const orderDate = cells[1] ?? "";
    if (cells.length < 3 || !ORDER_DATE_RE.test(orderDate)) {
      continue;
    }
    const href = ORDER_HREF_RE.exec(row)?.[1]?.trim();
    if (!href) {
      continue;
    }
    orders.push({
      id: asOrderId(`${cnr}-${orderNo || orderDate}`),
      pdf: { uri: href, contentType: "application/pdf" },
      date: orderDate,
    });
  }
  return orders;
}

function mapFetchedCase(cnr: Cnr, raw: RawEcourtsCase): FetchedCase {
  const court: CourtHierarchy = {
    stateOrHighCourt: raw.state_name ?? "",
    districtOrBench: raw.district_name ?? "",
    court: raw.court_name ?? "",
  };
  const details: CaseDetails = {
    parties: joinParties(raw.pet_name ?? raw.petparty_name, raw.res_name ?? raw.resparty_name),
    caseType: raw.type_name,
    caseNumber: raw.reg_no !== undefined ? String(raw.reg_no) : raw.case_no,
    year: raw.reg_year === undefined ? undefined : Number(raw.reg_year),
    filingDate: raw.date_of_filing,
    registrationDate: raw.dt_regis,
    // eCourts' history has no explicit Pending/Disposed flag — derive it from the decision date.
    status: raw.date_of_decision ? "Disposed" : "Pending",
    nextHearingDate: raw.date_next_list,
  };
  // Orders ride as HTML tables under interimOrder / finalOrder; parse both into structured orders.
  const orders = [
    ...parseOrdersHtml(cnr, raw.interimOrder),
    ...parseOrdersHtml(cnr, raw.finalOrder),
  ];
  return { cnr, court, details, orders };
}

/** True when the response carries no usable case data (CNR not found / an error envelope). */
function isEmptyCase(raw: RawEcourtsCase): boolean {
  return !raw.cino && !raw.type_name && !raw.pet_name && !raw.res_name;
}

/**
 * A row inside a search establishment bucket (`caseNos[]`) — field names VERIFIED from a 2026-06-07
 * live party-search capture. (The backend also sends `case_no2` / `case_type` / `party_name1|2` /
 * `petnameadArr` / `orcase`, all redundant with the fields used here.)
 */
interface RawSearchRow {
  readonly cino?: string;
  readonly pet_name?: string;
  readonly res_name?: string;
  readonly case_no?: string;
  readonly reg_year?: string | number;
  readonly case_year?: string | number;
  readonly type_name?: string;
}

/**
 * A successful search returns numeric-keyed establishment buckets (`{ "0": {court_code,
 * establishment_name, caseNos:[…]}, … }`) alongside `token` / `no_of_establishments`. Flatten the
 * numeric buckets' `caseNos` rows into CaseSearchResults; the scope supplies the state/district names
 * the rows omit. (Verified against the reference client's `parse_*_search`.)
 */
function flattenSearchResults(decoded: unknown, scope: CourtScope): CaseSearchResult[] {
  if (!decoded || typeof decoded !== "object") {
    return [];
  }
  const out: CaseSearchResult[] = [];
  for (const [key, bucket] of Object.entries(decoded)) {
    if (!/^\d+$/.test(key) || !bucket || typeof bucket !== "object") {
      continue;
    }
    const established = bucket as {
      establishment_name?: string;
      caseNos?: readonly RawSearchRow[];
    };
    const court = established.establishment_name ?? scope.court ?? "";
    for (const row of established.caseNos ?? []) {
      if (!row.cino) {
        continue;
      }
      const year = row.reg_year ?? row.case_year;
      out.push({
        cnr: asCnr(row.cino),
        parties: joinParties(row.pet_name, row.res_name) ?? "",
        court: {
          stateOrHighCourt: scope.stateOrHighCourt,
          districtOrBench: scope.districtOrBench ?? "",
          court,
        },
        caseType: row.type_name,
        caseNumber: row.case_no,
        year: year === undefined ? undefined : Number(year),
      });
    }
  }
  return out;
}

/** Reformat an ISO date (`YYYY-MM-DD`) to the `DD-MM-YYYY` cases_new.php expects; pass others through. */
function toCauseListDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** The backend serves the live list for today/future and the archived list for past dates. */
function isPastDate(iso: string): boolean {
  return iso.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

/**
 * Parse a `cases_new.php` cause-list HTML table into entries. Ported from the reference client's
 * `parse_cause_list`: rows with a single `colspan`'d cell are section headers (we carry the text as
 * the entry `purpose`); a listing row has >= 3 cells whose first is a numeric serial (the `item`),
 * a case anchor in cell 2 (`case_no=` is the uniform number, `cino=` the CNR when present), and the
 * parties text in cell 3. Header / spacer rows (non-numeric serial) are skipped. Dependency-free,
 * matching the order-table parser's approach. `cases` is `false` when the court has no list that day.
 */
function parseCauseListHtml(html: unknown, court: CourtHierarchy, date: string): CauseListEntry[] {
  if (typeof html !== "string") {
    return [];
  }
  const entries: CauseListEntry[] = [];
  let section: string | undefined;
  for (const rowMatch of html.matchAll(ORDER_ROW_RE)) {
    const cells = [...(rowMatch[1] ?? "").matchAll(CAUSE_CELL_RE)];
    if (cells.length === 0) {
      continue;
    }
    if (cells.length === 1 && CAUSE_COLSPAN_RE.test(cells[0]?.[1] ?? "")) {
      const heading = stripHtml(cells[0]?.[2] ?? "");
      if (heading) {
        section = heading;
      }
      continue;
    }
    if (cells.length < 3) {
      continue;
    }
    const item = stripHtml(cells[0]?.[2] ?? "");
    if (!CAUSE_SR_RE.test(item)) {
      continue;
    }
    const caseCell = cells[1]?.[2] ?? "";
    const caseNumber = CAUSE_CASE_NO_RE.exec(caseCell)?.[1] ?? stripHtml(caseCell);
    const cino = CAUSE_CINO_RE.exec(caseCell)?.[1];
    const parties = stripHtml(cells[2]?.[2] ?? "");
    entries.push({
      court,
      date,
      cnr: cino ? asCnr(cino.toUpperCase()) : undefined,
      caseNumber: caseNumber || undefined,
      parties: parties || undefined,
      item,
      purpose: section,
    });
  }
  return entries;
}

export class EcourtsMobileSource implements CourtDataSource {
  readonly id: SourceId = "ecourts-mobile";
  private readonly baseUrl: string;
  private readonly transport: EcourtsTransport;
  private readonly codec: EcourtsCodec;
  private readonly languageFlag: string;
  private readonly bilingualFlag: string;
  private readonly uid: string;
  /** The session JWT, minted lazily via appReleaseWebService.php and reused (encrypted) per call. */
  private jwtToken: string | null = null;

  constructor(config: EcourtsMobileConfig = {}) {
    const base = config.baseUrl ?? process.env.NOWLEZ_ECOURTS_BASE_URL ?? ECOURTS_DEFAULT_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, "");
    this.transport =
      config.transport ??
      makeEcourtsTransport(config.fetchImpl ?? fetch, config.timeoutMs ?? 30_000);
    this.codec = config.codec ?? createEcourtsCodec();
    this.languageFlag = config.languageFlag ?? "english";
    this.bilingualFlag = config.bilingualFlag ?? "0";
    this.uid = ecourtsUid({ deviceId: config.deviceId, packageName: config.packageName });
  }

  /**
   * Mint the session JWT if we don't have one yet, via an UNAUTHENTICATED appReleaseWebService.php
   * call (`{version, uid}`) — the app's bootstrap (index.js / reference `Session.init`). Without it
   * the backend under-privileges subsequent calls (search returns only `no_of_establishments`).
   */
  private async ensureSession(): Promise<string> {
    if (this.jwtToken === null) {
      const { token } = await ecourtsRoundTrip({
        url: `${this.baseUrl}/appReleaseWebService.php`,
        params: { version: APP_VERSION, uid: this.uid },
        token: null, // no bearer on the bootstrap
        codec: this.codec,
        transport: this.transport,
      });
      if (!token) {
        throw new Error("eCourts: appReleaseWebService.php bootstrap returned no token");
      }
      this.jwtToken = token;
    }
    return this.jwtToken;
  }

  /**
   * One authenticated round-trip: bootstrap the JWT, send the `params` blob with the encrypted Bearer
   * (+ the 401→uid retry), decode the body, and capture any refreshed token.
   */
  private async request(endpoint: string, paramObject: Record<string, string>): Promise<unknown> {
    const token = await this.ensureSession();
    const { decoded, token: refreshed } = await ecourtsRequest({
      url: `${this.baseUrl}/${endpoint}`,
      params: paramObject,
      token,
      codec: this.codec,
      transport: this.transport,
      uid: this.uid,
    });
    if (refreshed) {
      this.jwtToken = refreshed;
    }
    return decoded;
  }

  /** The `language_flag` / `bilingual_flag` every request carries (shared with the capture tool). */
  private requestFlags(): RequestFlags {
    return { languageFlag: this.languageFlag, bilingualFlag: this.bilingualFlag };
  }

  async getCaseByCnr(cnr: Cnr): Promise<FetchedCase> {
    // Verified: caseHistoryWebService.php with the CNR as `cinum`; the case rides under `history`.
    const { endpoint, params } = caseHistoryRequest(cnr, this.requestFlags());
    const decoded = await this.request(endpoint, params);
    const raw = (decoded as { history?: RawEcourtsCase } | null)?.history;
    if (!raw || isEmptyCase(raw)) {
      throw new Error(`eCourts: no case found for CNR ${cnr}`);
    }
    return mapFetchedCase(cnr, raw);
  }

  /** Tracking re-fetches the case; the orders ride along with it. */
  async getOrders(cnr: Cnr): Promise<readonly FetchedOrder[]> {
    return (await this.getCaseByCnr(cnr)).orders;
  }

  /**
   * Add a case by QR scan. eCourts QR codes encode the CNR; pull it out and resolve via the
   * verified case-history path. (The QR payload format is the only assumption here.)
   */
  async getCaseByQr(qrPayload: string): Promise<FetchedCase> {
    const match = qrPayload.match(CNR_PATTERN);
    if (!match) {
      throw new Error("eCourts: QR did not contain a CNR");
    }
    return this.getCaseByCnr(asCnr(match[0].toUpperCase()));
  }

  async searchByParty(query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    const { endpoint, params } = partySearchRequest(
      { scope: query.scope, partyName: query.partyName, year: query.year },
      this.requestFlags(),
    );
    const decoded = await this.request(endpoint, params);
    return flattenSearchResults(decoded, query.scope);
  }

  async searchByCaseNumber(query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    const { endpoint, params } = caseNumberSearchRequest(
      {
        scope: query.scope,
        caseType: query.caseType,
        caseNumber: query.caseNumber,
        year: query.year,
      },
      this.requestFlags(),
    );
    const decoded = await this.request(endpoint, params);
    return flattenSearchResults(decoded, query.scope);
  }

  /**
   * The court's daily cause list, via `cases_new.php`. A district list is addressed by the pair
   * (establishment `court_code` = `scope.court`, courtroom `court_no` = `query.courtNo`) — the
   * backend has no DC enumerator, so the caller supplies both. The civil and criminal lists are
   * separate calls (the UI's radio); we fetch both and merge. Returns `[]` for courtrooms with no
   * list that day (the backend sends `cases: false`).
   */
  async getCauseList(query: CauseListQuery): Promise<readonly CauseListEntry[]> {
    const courtCode = query.scope.court;
    const courtNo = query.courtNo;
    if (!courtCode || !courtNo) {
      throw new Error(
        "eCourts cause list needs scope.court (establishment court_code) and query.courtNo (courtroom).",
      );
    }
    const court: CourtHierarchy = {
      stateOrHighCourt: query.scope.stateOrHighCourt,
      districtOrBench: query.scope.districtOrBench ?? "",
      court: courtCode,
    };
    const causelistDate = toCauseListDate(query.date);
    const selPrevDays = isPastDate(query.date) ? "1" : "0";
    const entries: CauseListEntry[] = [];
    for (const flag of ["civ_t", "cri_t"] as const) {
      const { endpoint, params } = causesNewRequest(
        { scope: query.scope, courtNo, courtCode, causelistDate, flag, selPrevDays },
        this.requestFlags(),
      );
      const decoded = await this.request(endpoint, params);
      const html = (decoded as { cases?: unknown } | null)?.cases;
      entries.push(...parseCauseListHtml(html, court, query.date));
    }
    return entries;
  }
}
