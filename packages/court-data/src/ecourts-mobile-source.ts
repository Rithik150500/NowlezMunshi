/**
 * The eCourts **Services mobile-app** CourtDataSource (ADR-0004, ADR-0016).
 *
 * ⚠️ PROVISIONAL & UNVERIFIED. The 2026-06-05 APK teardown
 * (docs/research/2026-06-05-ecourts-apk-teardown.md) found the mobile backend
 * (`app.ecourts.gov.in`) CAPTCHA- and attestation-free; the one barrier is the app's
 * per-release **request-parameter encryption**. This adapter builds everything *around* that:
 * the CourtDataSource port, an injectable HTTP transport, the request→response mapping, and a
 * pluggable param codec seam. The exact endpoint paths, parameter names, and JSON field names
 * below are **assumptions** that still need a live MITM capture to confirm; they are isolated
 * here so a confirmed shape is a small change, not a ripple. Legal/compliance review of automated
 * extraction is a separate, unresolved prerequisite (open-questions.md#ecourts-integration).
 */
import {
  asOrderId,
  type CaseDetails,
  type CaseNumberSearchQuery,
  type CaseSearchResult,
  type CauseListEntry,
  type CauseListQuery,
  type Cnr,
  type CourtDataSource,
  type CourtHierarchy,
  type FetchedCase,
  type FetchedOrder,
  NotImplementedError,
  type PartySearchQuery,
  type SourceId,
} from "@nowlez/contracts";

/** Sends one request to the eCourts backend and returns the parsed JSON body. Injectable for tests. */
export type EcourtsTransport = (
  url: string,
  params: Readonly<Record<string, string>>,
) => Promise<unknown>;

/**
 * Encodes request parameters into the wire form the app expects. The app applies a per-release
 * **request-parameter encryption** — replicate it here once a MITM capture confirms it. The
 * default is a PASSTHROUGH: structurally complete, but the live endpoint will reject unencrypted
 * params until a real codec is supplied.
 */
export interface EcourtsParamCodec {
  encode(params: Readonly<Record<string, string>>): Record<string, string>;
}

export const identityParamCodec: EcourtsParamCodec = {
  encode: (params) => ({ ...params }),
};

/** PROVISIONAL default host (research) — confirm/override per deployment via NOWLEZ_ECOURTS_BASE_URL. */
export const ECOURTS_DEFAULT_BASE_URL = "https://app.ecourts.gov.in";
/** PROVISIONAL request path for a case-by-CNR lookup — confirm via MITM capture. */
const DEFAULT_CASE_BY_CNR_PATH = "services/case/cnr";

export interface EcourtsMobileConfig {
  readonly baseUrl?: string;
  readonly transport?: EcourtsTransport;
  readonly codec?: EcourtsParamCodec;
  readonly caseByCnrPath?: string;
}

const defaultTransport: EcourtsTransport = async (url, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) {
    throw new Error(`eCourts request failed: HTTP ${response.status}`);
  }
  return response.json();
};

/**
 * PROVISIONAL shape of the case-by-CNR response. Field names are UNVERIFIED (pending MITM
 * capture); the mapper below is lenient so the confirmed shape is a small, local change.
 */
interface RawEcourtsCase {
  readonly cnr?: string;
  readonly state?: string;
  readonly district?: string;
  readonly court_name?: string;
  readonly petitioner?: string;
  readonly respondent?: string;
  readonly case_type?: string;
  readonly reg_no?: string;
  readonly reg_year?: string | number;
  readonly filing_date?: string;
  readonly reg_date?: string;
  readonly status?: string;
  readonly next_hearing?: string;
  readonly orders?: readonly {
    readonly order_no?: string;
    readonly order_date?: string;
    readonly pdf_url?: string;
  }[];
}

function joinParties(petitioner?: string, respondent?: string): string | undefined {
  if (petitioner && respondent) {
    return `${petitioner} vs ${respondent}`;
  }
  return petitioner ?? respondent;
}

function mapFetchedCase(cnr: Cnr, raw: RawEcourtsCase): FetchedCase {
  const court: CourtHierarchy = {
    stateOrHighCourt: raw.state ?? "",
    districtOrBench: raw.district ?? "",
    court: raw.court_name ?? "",
  };
  const details: CaseDetails = {
    parties: joinParties(raw.petitioner, raw.respondent),
    caseType: raw.case_type,
    caseNumber: raw.reg_no,
    year: raw.reg_year === undefined ? undefined : Number(raw.reg_year),
    filingDate: raw.filing_date,
    registrationDate: raw.reg_date,
    status: raw.status,
    nextHearingDate: raw.next_hearing,
  };
  const orders: FetchedOrder[] = (raw.orders ?? []).map((order, index) => ({
    id: asOrderId(`${cnr}-${order.order_no ?? index + 1}`),
    pdf: { uri: order.pdf_url ?? "", contentType: "application/pdf" },
    date: order.order_date,
  }));
  return { cnr, court, details, orders };
}

/** True when the response carries no usable case data (i.e. CNR not found / an error envelope). */
function isEmptyCase(raw: RawEcourtsCase): boolean {
  return (
    !raw.cnr &&
    !raw.case_type &&
    !raw.petitioner &&
    !raw.respondent &&
    (raw.orders?.length ?? 0) === 0
  );
}

export class EcourtsMobileSource implements CourtDataSource {
  readonly id: SourceId = "ecourts-mobile";
  private readonly baseUrl: string;
  private readonly transport: EcourtsTransport;
  private readonly codec: EcourtsParamCodec;
  private readonly caseByCnrPath: string;

  constructor(config: EcourtsMobileConfig = {}) {
    const base = config.baseUrl ?? process.env.NOWLEZ_ECOURTS_BASE_URL ?? ECOURTS_DEFAULT_BASE_URL;
    this.baseUrl = base.replace(/\/+$/, "");
    this.transport = config.transport ?? defaultTransport;
    this.codec = config.codec ?? identityParamCodec;
    this.caseByCnrPath = config.caseByCnrPath ?? DEFAULT_CASE_BY_CNR_PATH;
  }

  async getCaseByCnr(cnr: Cnr): Promise<FetchedCase> {
    // `cino` is the app's CNR parameter (PROVISIONAL); the codec applies the request encryption.
    const params = this.codec.encode({ cino: cnr });
    const raw = (await this.transport(
      `${this.baseUrl}/${this.caseByCnrPath}`,
      params,
    )) as RawEcourtsCase;
    if (!raw || isEmptyCase(raw)) {
      throw new Error(`eCourts: no case found for CNR ${cnr}`);
    }
    return mapFetchedCase(cnr, raw);
  }

  /** Tracking re-fetches the case; the orders ride along with it. */
  async getOrders(cnr: Cnr): Promise<readonly FetchedOrder[]> {
    return (await this.getCaseByCnr(cnr)).orders;
  }

  // The remaining operations land as later slices, mirroring how add-case-by-CNR led the mock.
  async getCaseByQr(_qrPayload: string): Promise<FetchedCase> {
    throw new NotImplementedError("EcourtsMobileSource.getCaseByQr", "a later slice");
  }
  async searchByParty(_query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("EcourtsMobileSource.searchByParty", "a later slice");
  }
  async searchByCaseNumber(_query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("EcourtsMobileSource.searchByCaseNumber", "a later slice");
  }
  async getCauseList(_query: CauseListQuery): Promise<readonly CauseListEntry[]> {
    throw new NotImplementedError("EcourtsMobileSource.getCauseList", "a later slice");
  }
}
