/**
 * Operator-run **live capture** helper for the eCourts mobile backend (ADR-0016).
 *
 * Because the codec is reimplemented ({@link createEcourtsCodec}), confirming the one remaining
 * unknown — the inner **response field names** — needs no MITM proxy: just one real request through
 * the verified protocol, printing the decoded JSON. This module is the testable core; the thin CLI
 * runner is `packages/court-data/scripts/ecourts-capture.ts`.
 *
 * ⚠️ A live capture makes a real request to a government judicial backend — the **legally-gated**
 * action. It is the OPERATOR's to trigger, on their **own account and own case**, with
 * **legal/compliance sign-off** in hand (see docs/runbooks/ecourts-mitm-and-codec.md). The runner
 * refuses to run unless that is affirmed via {@link assertLiveCaptureAllowed}. Default output is the
 * PII-safe {@link redactToShape} skeleton, not raw personal data.
 */
import type { CourtScope } from "@nowlez/contracts";
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
  causeListRequest,
  type EcourtsRequest,
  ecourtsUid,
  fillCourtComplexRequest,
  partySearchRequest,
  type RequestFlags,
} from "./ecourts-requests";

/** Default District-Courts base (override with the HC base for High Court captures). */
const DEFAULT_BASE_URL = "https://app.ecourts.gov.in/ecourt_mobile_DC/";

export interface CaptureConfig {
  readonly baseUrl?: string;
  readonly codec?: EcourtsCodec;
  readonly transport?: EcourtsTransport;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly languageFlag?: string;
  readonly bilingualFlag?: string;
  readonly deviceId?: string;
  readonly packageName?: string;
}

/** One live request to `endpoint` (with the 401 bootstrap), returning the RAW decoded JSON (un-mapped). */
export async function captureEndpoint(
  endpoint: string,
  params: Readonly<Record<string, string>>,
  config: CaptureConfig = {},
): Promise<unknown> {
  const baseUrl = (
    config.baseUrl ??
    process.env.NOWLEZ_ECOURTS_BASE_URL ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const codec = config.codec ?? createEcourtsCodec();
  const transport =
    config.transport ?? makeEcourtsTransport(config.fetchImpl ?? fetch, config.timeoutMs ?? 30_000);
  const uid = ecourtsUid({ deviceId: config.deviceId, packageName: config.packageName });
  // Bootstrap the session JWT first (appReleaseWebService.php, no bearer), like the production source
  // — search needs the minted JWT, not the inline 401 retry.
  const boot = await ecourtsRoundTrip({
    url: `${baseUrl}/appReleaseWebService.php`,
    params: { version: "3.0", uid },
    token: null,
    codec,
    transport,
  });
  const { decoded } = await ecourtsRequest({
    url: `${baseUrl}/${endpoint}`,
    params,
    token: boot.token ?? "",
    codec,
    transport,
    uid,
  });
  return decoded;
}

/** A parsed capture request: which operation + its inputs (discriminated by `mode`). */
export type CaptureCommand =
  | { readonly mode: "case"; readonly cnr: string }
  | {
      readonly mode: "party";
      readonly scope: CourtScope;
      readonly partyName: string;
      readonly year: number;
      readonly pendingDisposed: string;
    }
  | {
      readonly mode: "case-number";
      readonly scope: CourtScope;
      readonly caseType: string;
      readonly caseNumber: string;
      readonly year: number;
    }
  | { readonly mode: "cause-list"; readonly scope: CourtScope; readonly date: string }
  | { readonly mode: "complexes"; readonly state: string; readonly dist: string };

function buildRequest(command: CaptureCommand, flags: RequestFlags): EcourtsRequest {
  switch (command.mode) {
    case "case":
      return caseHistoryRequest(command.cnr, flags);
    case "complexes":
      return fillCourtComplexRequest({ state: command.state, dist: command.dist });
    case "party":
      return partySearchRequest(
        {
          scope: command.scope,
          partyName: command.partyName,
          year: command.year,
          pendingDisposed: command.pendingDisposed,
        },
        flags,
      );
    case "case-number":
      return caseNumberSearchRequest(
        {
          scope: command.scope,
          caseType: command.caseType,
          caseNumber: command.caseNumber,
          year: command.year,
        },
        flags,
      );
    case "cause-list":
      return causeListRequest({ scope: command.scope, date: command.date }, flags);
  }
}

/** Run one capture command live, returning the RAW decoded response (un-mapped) for shape inspection. */
export function runCapture(command: CaptureCommand, config: CaptureConfig = {}): Promise<unknown> {
  const flags: RequestFlags = {
    languageFlag: config.languageFlag ?? "english",
    bilingualFlag: config.bilingualFlag ?? "0",
  };
  const { endpoint, params } = buildRequest(command, flags);
  return captureEndpoint(endpoint, params, config);
}

/** Capture the raw case-history response for one CNR (sent as `cinum`). */
export function captureCaseHistory(cnr: string, config: CaptureConfig = {}): Promise<unknown> {
  return runCapture({ mode: "case", cnr }, config);
}

export interface ParsedCapture {
  readonly command: CaptureCommand;
  /** Target the High Court base instead of District Courts. */
  readonly hc: boolean;
  /** Print the full decoded JSON instead of the PII-safe shape. */
  readonly raw: boolean;
}

const CAPTURE_MODES = ["case", "party", "case-number", "cause-list", "complexes"] as const;
type CaptureMode = (typeof CAPTURE_MODES)[number];

function isMode(value: string | undefined): value is CaptureMode {
  return value !== undefined && (CAPTURE_MODES as readonly string[]).includes(value);
}

/** Split argv into positionals and `--key value` / `--bool` flags (booleans map to "true"). */
function splitArgs(argv: readonly string[]): { positionals: string[]; flags: Map<string, string> } {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (token.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(token.slice(2), next);
        i++;
      } else {
        flags.set(token.slice(2), "true");
      }
    } else {
      positionals.push(token);
    }
  }
  return { positionals, flags };
}

function required(flags: Map<string, string>, key: string, label: string): string {
  const value = flags.get(key);
  if (value === undefined || value === "true") {
    throw new Error(`Missing --${key} (${label})`);
  }
  return value;
}

function scopeFromFlags(flags: Map<string, string>): CourtScope {
  const state = required(flags, "state", "state / High Court code");
  const dist = flags.get("dist");
  const court = flags.get("court");
  return {
    stateOrHighCourt: state,
    ...(dist && dist !== "true" ? { districtOrBench: dist } : {}),
    ...(court && court !== "true" ? { court } : {}),
  };
}

function yearFromFlags(flags: Map<string, string>): number {
  const year = Number(required(flags, "year", "4-digit year"));
  if (!Number.isInteger(year)) {
    throw new Error("--year must be a whole number");
  }
  return year;
}

/**
 * Parse capture CLI args. First positional is the mode (`case` | `party` | `case-number` |
 * `cause-list`); a bare CNR with no mode defaults to `case`. Throws an Error (with usage) on missing
 * required flags. Pure — no I/O — so it's fully unit-tested.
 */
export function parseCaptureArgs(argv: readonly string[]): ParsedCapture {
  const { positionals, flags } = splitArgs(argv);
  const hc = flags.get("hc") === "true";
  const raw = flags.get("raw") === "true";
  const mode: CaptureMode = isMode(positionals[0]) ? positionals[0] : "case";
  const rest = isMode(positionals[0]) ? positionals.slice(1) : positionals;
  const status = flags.get("status");

  switch (mode) {
    case "case": {
      const cnr = rest[0] ?? flags.get("cnr");
      if (cnr === undefined || cnr === "true") {
        throw new Error("Missing CNR. Usage: ecourts:capture <CNR> [--hc] [--raw]");
      }
      return { command: { mode: "case", cnr }, hc, raw };
    }
    case "party":
      return {
        command: {
          mode: "party",
          scope: scopeFromFlags(flags),
          partyName: required(flags, "name", "party name"),
          year: yearFromFlags(flags),
          pendingDisposed: status && status !== "true" ? status : "Pending",
        },
        hc,
        raw,
      };
    case "case-number":
      return {
        command: {
          mode: "case-number",
          scope: scopeFromFlags(flags),
          caseType: required(flags, "type", "case type"),
          caseNumber: required(flags, "no", "case number"),
          year: yearFromFlags(flags),
        },
        hc,
        raw,
      };
    case "cause-list":
      return {
        command: {
          mode: "cause-list",
          scope: scopeFromFlags(flags),
          date: required(flags, "date", "ISO date YYYY-MM-DD"),
        },
        hc,
        raw,
      };
    case "complexes":
      return {
        command: {
          mode: "complexes",
          state: required(flags, "state", "state / High Court code"),
          dist: required(flags, "dist", "district code"),
        },
        hc,
        raw,
      };
  }
}

/**
 * Reduce a decoded response to a PII-safe **shape**: keys and nesting are preserved, but every leaf
 * value becomes its type tag (`"<string>"` / `"<number>"` / `"<boolean>"`), arrays collapse to a
 * single sample element, and `null` is kept. The result is safe to share and is exactly what's
 * needed to lock the response field names into the adapter's mappers.
 */
export function redactToShape(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? [] : [redactToShape(value[0])];
  }
  if (typeof value === "object") {
    const shape: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      shape[key] = redactToShape(val);
    }
    return shape;
  }
  return `<${typeof value}>`;
}

/** A court complex / establishment from `fillCourtComplex`: `code` is the njdg_est_code a search uses. */
export interface CourtComplexEntry {
  readonly code: string;
  readonly name: string;
  readonly complexCode: string;
}

interface RawCourtComplex {
  readonly njdg_est_code?: string | number;
  readonly court_complex_name?: string;
  readonly complex_code?: string | number;
}

/**
 * Map a `complexes` (fillCourtComplex) response to a clean `{code, name, complexCode}` list — `code`
 * is the `njdg_est_code` a search passes as `court_code_arr`. This is public reference data (no PII),
 * so the capture tool prints it directly to help pick the right establishment to search.
 */
export function mapCourtComplexes(decoded: unknown): CourtComplexEntry[] {
  let list: unknown[];
  if (Array.isArray(decoded)) {
    list = decoded;
  } else {
    const wrapped = (decoded as { courtComplex?: unknown } | null)?.courtComplex;
    list = Array.isArray(wrapped) ? wrapped : [];
  }
  return (list as RawCourtComplex[])
    .filter(
      (c) =>
        c.njdg_est_code !== undefined && c.njdg_est_code !== null && Boolean(c.court_complex_name),
    )
    .map((c) => ({
      code: String(c.njdg_est_code),
      name: c.court_complex_name ?? "",
      complexCode: String(c.complex_code ?? ""),
    }));
}

/**
 * Gate the live capture: throws unless `NOWLEZ_ECOURTS_LIVE_OK=1`. This is a deliberate human
 * affirmation that legal/compliance sign-off for LIVE use is in place and the capture is against the
 * operator's own account/case — not a security control, just a tripwire against accidental traffic.
 */
export function assertLiveCaptureAllowed(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (env.NOWLEZ_ECOURTS_LIVE_OK !== "1") {
    throw new Error(
      "Refusing live eCourts capture. Set NOWLEZ_ECOURTS_LIVE_OK=1 only if you have legal/compliance " +
        "sign-off for LIVE use and are querying your OWN account/case. See " +
        "docs/runbooks/ecourts-mitm-and-codec.md.",
    );
  }
}
