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
import { createEcourtsCodec, type EcourtsCodec } from "./ecourts-codec";
import { type EcourtsTransport, ecourtsRoundTrip, makeEcourtsTransport } from "./ecourts-protocol";

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
}

/** One live round-trip to `endpoint` with `params`, returning the RAW decoded JSON (un-mapped). */
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
  const { decoded } = await ecourtsRoundTrip({
    url: `${baseUrl}/${endpoint}`,
    params,
    token: "",
    codec,
    transport,
  });
  return decoded;
}

/** Capture the raw case-history response for one CNR (sent as `cinum`). */
export function captureCaseHistory(cnr: string, config: CaptureConfig = {}): Promise<unknown> {
  return captureEndpoint(
    "caseHistoryWebService.php",
    {
      cinum: cnr,
      language_flag: config.languageFlag ?? "english",
      bilingual_flag: config.bilingualFlag ?? "0",
    },
    config,
  );
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
