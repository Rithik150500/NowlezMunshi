/**
 * The eCourts **Services mobile-app** CourtDataSource (ADR-0004, ADR-0016).
 *
 * The wire protocol below is VERIFIED by the 2026-06-07 static teardown of the official eCourts
 * Services APK (docs/research/2026-06-07-ecourts-apk-teardown.md) — a Cordova/WebView app whose
 * request logic is plain JS (`assets/www/js/main.js` for District Courts, `main_hc.js` for High
 * Courts). Confirmed facts, all reproduced here:
 *   • base: `https://app.ecourts.gov.in/ecourt_mobile_DC/` (DC) or `…/ecourt_mobile_HC/` (HC);
 *   • each call is `GET {base}{endpoint}.php?params=<blob>` where <blob> is the AES request
 *     encryption (see {@link EcourtsCodec}) of `JSON.stringify(paramObject)`;
 *   • header `Authorization: Bearer <encrypt(jwtToken)>` (empty token on the first call; the
 *     backend returns `token` in the decoded body, which is reused thereafter);
 *   • the response body is itself AES-encrypted and decoded via the codec, then JSON-parsed.
 * Verified endpoints + request params: case-history (`caseHistoryWebService.php`, CNR as `cinum`)
 * and party search (`showDataWebService.php`, name as `pet_name`). The case-number-search and
 * cause-list endpoint *filenames* are confirmed; their exact request params and response field
 * names are still PROVISIONAL pending a live capture, so the mappers stay lenient.
 *
 * Speaking this protocol against the live government backend is an operator-owned decision: this
 * source is OFF by default (selected only via NOWLEZ_COURT_SOURCE=ecourts-mobile) and live use is
 * gated on legal/compliance sign-off (open-questions.md#ecourts-integration,
 * docs/runbooks/ecourts-mitm-and-codec.md).
 */
import {
  asCnr,
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
import { type EcourtsTransport, ecourtsRequest, makeEcourtsTransport } from "./ecourts-protocol";
import {
  caseHistoryRequest,
  caseNumberSearchRequest,
  causeListRequest,
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
 * live capture. The order arrays (`interimOrder` / `finalOrder`) were null in that capture, so their
 * ELEMENT field names remain provisional and are read leniently (a with-orders capture confirms them).
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
  // interimOrder / finalOrder are server-rendered HTML tables (the app appends them to the DOM),
  // NOT JSON arrays — so structured order extraction needs an HTML parser built from a real
  // with-orders sample (a follow-up). Order/business PDFs are a separate s_show_business.php flow.
  readonly interimOrder?: string | null;
  readonly finalOrder?: string | null;
}

function joinParties(petitioner?: string, respondent?: string): string | undefined {
  if (petitioner && respondent) {
    return `${petitioner} vs ${respondent}`;
  }
  return petitioner ?? respondent;
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
  // Orders arrive as HTML tables (raw.interimOrder / raw.finalOrder); until they're parsed from a
  // real with-orders sample, expose no structured orders rather than guess a shape.
  const orders: FetchedOrder[] = [];
  return { cnr, court, details, orders };
}

/** True when the response carries no usable case data (CNR not found / an error envelope). */
function isEmptyCase(raw: RawEcourtsCase): boolean {
  return !raw.cino && !raw.type_name && !raw.pet_name && !raw.res_name;
}

/** PROVISIONAL shapes for the search / cause-list rows (UNVERIFIED field names, pending live capture). */
interface RawSearchHit {
  readonly cnr?: string;
  readonly petitioner?: string;
  readonly respondent?: string;
  readonly state?: string;
  readonly district?: string;
  readonly court_name?: string;
  readonly case_type?: string;
  readonly reg_no?: string;
  readonly reg_year?: string | number;
}

interface RawCauseRow {
  readonly cnr?: string;
  readonly date?: string;
  readonly district?: string;
  readonly court_name?: string;
  readonly case_no?: string;
  readonly petitioner?: string;
  readonly respondent?: string;
  readonly item_no?: string;
  readonly purpose?: string;
}

/** A response is either a bare array or `{ [oneOfKeys]: [...] }` — lenient until shapes are confirmed. */
function asList<T>(raw: unknown, keys: readonly string[]): readonly T[] {
  if (Array.isArray(raw)) {
    return raw as T[];
  }
  const obj = raw as Record<string, unknown> | null | undefined;
  for (const key of keys) {
    const wrapped = obj?.[key];
    if (Array.isArray(wrapped)) {
      return wrapped as T[];
    }
  }
  return [];
}

function mapSearchHit(raw: RawSearchHit): CaseSearchResult {
  return {
    cnr: asCnr(raw.cnr ?? ""),
    parties: joinParties(raw.petitioner, raw.respondent) ?? "",
    court: {
      stateOrHighCourt: raw.state ?? "",
      districtOrBench: raw.district ?? "",
      court: raw.court_name ?? "",
    },
    caseType: raw.case_type,
    caseNumber: raw.reg_no,
    year: raw.reg_year === undefined ? undefined : Number(raw.reg_year),
  };
}

function mapCauseRow(scope: CourtScope, date: string, raw: RawCauseRow): CauseListEntry {
  return {
    court: {
      stateOrHighCourt: scope.stateOrHighCourt,
      districtOrBench: raw.district ?? scope.districtOrBench ?? "",
      court: raw.court_name ?? scope.court ?? "",
    },
    date: raw.date ?? date,
    cnr: raw.cnr ? asCnr(raw.cnr) : undefined,
    caseNumber: raw.case_no,
    parties: joinParties(raw.petitioner, raw.respondent),
    item: raw.item_no,
    purpose: raw.purpose,
  };
}

export class EcourtsMobileSource implements CourtDataSource {
  readonly id: SourceId = "ecourts-mobile";
  private readonly baseUrl: string;
  private readonly transport: EcourtsTransport;
  private readonly codec: EcourtsCodec;
  private readonly languageFlag: string;
  private readonly bilingualFlag: string;
  private readonly uid: string;
  /** The JWT the backend hands back (empty until the first response); resent (encrypted) each call. */
  private jwtToken = "";

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
   * One round-trip: encrypt the param object into the `params` query value, attach the encrypted
   * Bearer token, GET, then decrypt + parse the body and capture any refreshed token. Returns the
   * decoded JSON object. (The 401-driven token regeneration the app performs is not modelled yet;
   * it needs a live capture to verify — see ADR-0016.)
   */
  private async request(endpoint: string, paramObject: Record<string, string>): Promise<unknown> {
    const { decoded, token } = await ecourtsRequest({
      url: `${this.baseUrl}/${endpoint}`,
      params: paramObject,
      token: this.jwtToken,
      codec: this.codec,
      transport: this.transport,
      uid: this.uid,
    });
    if (token) {
      this.jwtToken = token;
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
    return asList<RawSearchHit>(decoded, ["cases", "results"]).map(mapSearchHit);
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
    return asList<RawSearchHit>(decoded, ["cases", "results"]).map(mapSearchHit);
  }

  async getCauseList(query: CauseListQuery): Promise<readonly CauseListEntry[]> {
    const { endpoint, params } = causeListRequest(
      { scope: query.scope, date: query.date },
      this.requestFlags(),
    );
    const decoded = await this.request(endpoint, params);
    return asList<RawCauseRow>(decoded, ["cause_list", "entries"]).map((row) =>
      mapCauseRow(query.scope, query.date, row),
    );
  }
}
