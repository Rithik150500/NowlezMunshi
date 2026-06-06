/**
 * The eCourts mobile **wire protocol** — the single round-trip both the production
 * {@link EcourtsMobileSource} adapter and the (operator-run) capture tool use, so the protocol has
 * exactly one implementation. See ADR-0016 and docs/research/2026-06-07-ecourts-apk-teardown.md.
 *
 * A call is `GET {url}?params=<encrypt(params)>` with `Authorization: Bearer <encrypt(token)>`; the
 * (AES-encrypted) response body is decoded via the codec and JSON-parsed, and any refreshed `token`
 * is surfaced for the caller to reuse.
 */
import { withTimeout } from "@nowlez/contracts";
import type { EcourtsCodec } from "./ecourts-codec";

/**
 * Sends one request and returns the RAW response body text (AES-encrypted on the wire — the caller
 * decodes it via the codec, so the transport stays codec-agnostic and does only HTTP). Injectable
 * for tests.
 */
export type EcourtsTransport = (
  url: string,
  query: Readonly<Record<string, string>>,
  headers: Readonly<Record<string, string>>,
) => Promise<string>;

/** The default transport: a timed-out GET that carries the params as a query string. */
export function makeEcourtsTransport(fetchImpl: typeof fetch, timeoutMs: number): EcourtsTransport {
  const doFetch = withTimeout(fetchImpl, timeoutMs);
  return async (url, query, headers) => {
    const qs = new URLSearchParams(query).toString();
    const response = await doFetch(qs ? `${url}?${qs}` : url, { method: "GET", headers });
    if (!response.ok) {
      throw new Error(`eCourts request failed: HTTP ${response.status}`);
    }
    return response.text();
  };
}

export interface EcourtsRoundTripResult {
  /** The decoded, JSON-parsed response body. */
  readonly decoded: unknown;
  /** A refreshed JWT if the body carried one, else null (the caller decides whether to reuse it). */
  readonly token: string | null;
}

/** One verified eCourts request/response cycle (encrypt params + token → GET → decrypt → parse). */
export async function ecourtsRoundTrip(opts: {
  readonly url: string;
  readonly params: Readonly<Record<string, string>>;
  /** The current JWT (empty string bootstraps the first call). */
  readonly token: string;
  readonly codec: EcourtsCodec;
  readonly transport: EcourtsTransport;
}): Promise<EcourtsRoundTripResult> {
  const query = { params: opts.codec.encrypt(opts.params) };
  const headers = { Authorization: `Bearer ${opts.codec.encrypt(opts.token)}` };
  const body = await opts.transport(opts.url, query, headers);
  const decoded = JSON.parse(opts.codec.decryptResponse(body)) as unknown;
  let token: string | null = null;
  if (decoded && typeof decoded === "object") {
    const refreshed = (decoded as { token?: unknown }).token;
    if (typeof refreshed === "string" && refreshed.length > 0) {
      token = refreshed;
    }
  }
  return { decoded, token };
}

/** True when the decoded body is the backend's `status_code: 401` unauthorized envelope. */
function isUnauthorized(decoded: unknown): boolean {
  if (!decoded || typeof decoded !== "object") {
    return false;
  }
  const code = (decoded as { status_code?: unknown }).status_code;
  return code === "401" || code === 401;
}

/**
 * A full request with the app's **401 token bootstrap** (main.js `callToWebService`): make the call;
 * if the backend replies `status_code: 401` and a `uid` is available, retry ONCE with the `uid`
 * (`deviceId:packageName`) added to the params — which mints the session token and returns the data.
 * Retries at most once (mirrors `regenerateWebserviceCallFlag`), so a persistent 401 is surfaced.
 */
export async function ecourtsRequest(opts: {
  readonly url: string;
  readonly params: Readonly<Record<string, string>>;
  readonly token: string;
  readonly codec: EcourtsCodec;
  readonly transport: EcourtsTransport;
  /** The session uid added on a 401. Omit to disable the bootstrap retry. */
  readonly uid?: string;
}): Promise<EcourtsRoundTripResult> {
  const first = await ecourtsRoundTrip(opts);
  if (opts.uid && isUnauthorized(first.decoded)) {
    return ecourtsRoundTrip({
      url: opts.url,
      params: { ...opts.params, uid: opts.uid },
      token: first.token ?? opts.token,
      codec: opts.codec,
      transport: opts.transport,
    });
  }
  return first;
}
