/**
 * Request builders for the eCourts mobile endpoints — the single place that knows each operation's
 * endpoint filename and request parameter names. Shared by the production {@link EcourtsMobileSource}
 * and the operator capture tool, so a captured request is exactly the request the source sends.
 *
 * Verified from the 2026-06-07 teardown: case-history (`caseHistoryWebService.php`, CNR as `cinum`)
 * and party search (`showDataWebService.php`: `pet_name` + `pendingDisposed` + `year`). Case-number
 * search uses `caseNumberSearch.php` (`case_number` + `case_type` + `year`). Cause-list maps to
 * `causeListWebService.php` (`date` + scope) — PROVISIONAL: in the app that filename is the
 * advocate's cause list, while the court's daily list is `cases_new.php`; confirm via a live capture.
 */
import type { CourtScope } from "@nowlez/contracts";

export interface EcourtsRequest {
  readonly endpoint: string;
  readonly params: Record<string, string>;
}

/** The `language_flag` / `bilingual_flag` every request carries (app defaults: "english" / "0"). */
export interface RequestFlags {
  readonly languageFlag: string;
  readonly bilingualFlag: string;
}

/** The app package id (part of the session `uid`). From the APK + index.js. */
export const ECOURTS_PACKAGE_NAME = "in.gov.ecourts.eCourtsServices";
/** The app's own fallback device id when no device UUID is available (main.js / index.js). */
export const ECOURTS_FALLBACK_DEVICE_ID = "324456";

/**
 * Build the session `uid` (`deviceId:packageName`) the backend wants to mint a token on a 401
 * bootstrap (main.js `callToWebService`). The app uses the device UUID, falling back to a fixed id;
 * a headless client supplies a stable one (NOWLEZ_ECOURTS_DEVICE_ID / NOWLEZ_ECOURTS_PACKAGE).
 */
export function ecourtsUid(opts: { deviceId?: string; packageName?: string } = {}): string {
  const deviceId =
    opts.deviceId ?? process.env.NOWLEZ_ECOURTS_DEVICE_ID ?? ECOURTS_FALLBACK_DEVICE_ID;
  const packageName =
    opts.packageName ?? process.env.NOWLEZ_ECOURTS_PACKAGE ?? ECOURTS_PACKAGE_NAME;
  return `${deviceId}:${packageName}`;
}

/** Verified endpoint filenames (relative to the `ecourt_mobile_DC` / `…_HC` base). */
export const ECOURTS_ENDPOINTS = {
  caseHistory: "caseHistoryWebService.php",
  partySearch: "showDataWebService.php",
  caseNumberSearch: "caseNumberSearch.php",
  causeList: "causeListWebService.php",
  courtEstablishments: "courtEstWebService.php",
} as const;

/** Court scope -> state/district request params. eCourts keys on numeric codes. */
function scopeParams(scope: CourtScope): Record<string, string> {
  return {
    state_code: scope.stateOrHighCourt,
    ...(scope.districtOrBench ? { dist_code: scope.districtOrBench } : {}),
  };
}

/**
 * Establishment scope for SEARCHES — a search fans out across the establishments of a court complex,
 * so the app sends a comma-separated `court_code_arr` (from its `SESSION_COURT_CODE`), not a single
 * `court_code`. Callers pass the establishment code(s) through `scope.court`.
 */
function establishmentParams(scope: CourtScope): Record<string, string> {
  return scope.court ? { court_code_arr: scope.court } : {};
}

function withFlags(params: Record<string, string>, flags: RequestFlags): Record<string, string> {
  return { ...params, language_flag: flags.languageFlag, bilingual_flag: flags.bilingualFlag };
}

export function caseHistoryRequest(cnr: string, flags: RequestFlags): EcourtsRequest {
  return { endpoint: ECOURTS_ENDPOINTS.caseHistory, params: withFlags({ cinum: cnr }, flags) };
}

export function partySearchRequest(
  opts: {
    readonly scope: CourtScope;
    readonly partyName: string;
    readonly year: number;
    readonly pendingDisposed?: string;
  },
  flags: RequestFlags,
): EcourtsRequest {
  return {
    endpoint: ECOURTS_ENDPOINTS.partySearch,
    params: withFlags(
      {
        ...scopeParams(opts.scope),
        ...establishmentParams(opts.scope),
        pet_name: opts.partyName,
        pendingDisposed: opts.pendingDisposed ?? "Pending",
        year: String(opts.year),
      },
      flags,
    ),
  };
}

export function caseNumberSearchRequest(
  opts: {
    readonly scope: CourtScope;
    readonly caseType: string;
    readonly caseNumber: string;
    readonly year: number;
  },
  flags: RequestFlags,
): EcourtsRequest {
  return {
    endpoint: ECOURTS_ENDPOINTS.caseNumberSearch,
    params: withFlags(
      {
        ...scopeParams(opts.scope),
        ...establishmentParams(opts.scope),
        case_type: opts.caseType,
        case_number: opts.caseNumber,
        year: String(opts.year),
      },
      flags,
    ),
  };
}

export function causeListRequest(
  opts: { readonly scope: CourtScope; readonly date: string },
  flags: RequestFlags,
): EcourtsRequest {
  return {
    endpoint: ECOURTS_ENDPOINTS.causeList,
    params: withFlags({ ...scopeParams(opts.scope), date: opts.date }, flags),
  };
}

/**
 * Discover a district's court complexes via `courtEstWebService.php` (`fillCourtComplex`). The
 * response lists complexes each carrying `njdg_est_code` — the value a SEARCH passes as
 * `court_code_arr` (it's NOT the case's `court_code`/`est_code`). No language flags (the app omits
 * them for this call).
 */
export function fillCourtComplexRequest(opts: { state: string; dist: string }): EcourtsRequest {
  return {
    endpoint: ECOURTS_ENDPOINTS.courtEstablishments,
    params: { action_code: "fillCourtComplex", state_code: opts.state, dist_code: opts.dist },
  };
}
