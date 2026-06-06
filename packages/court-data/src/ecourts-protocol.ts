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
