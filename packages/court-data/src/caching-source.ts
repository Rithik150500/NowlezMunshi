/**
 * Operational discipline at the CourtDataSource seam (ADR-0002, ADR-0016): a **TTL cache** and a
 * **rate limiter** as decorators that wrap any source. Caching is the "fetch-once / fan-out"
 * mechanism (alerts-and-tracking.md) — many trackers of the same case collapse to one upstream
 * call; keep the TTL well below the daily-refresh interval so it never masks a day's changes. The
 * rate limiter spaces upstream calls to respect the source's limits. Both preserve the inner
 * source's `id` so selection and `GET /config` are unaffected.
 */
import type { CourtDataSource, SourceId } from "@nowlez/contracts";

/** Injectable clock (ms epoch) for deterministic tests. */
export interface Clock {
  now(): number;
}

const systemClock: Clock = { now: () => Date.now() };
const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface CacheOptions {
  readonly ttlMs: number;
  readonly clock?: Clock;
}

/** Caches read results by key for `ttlMs`. QR resolution is one-shot, so it is not cached. */
export class CachingCourtDataSource implements CourtDataSource {
  readonly id: SourceId;
  private readonly clock: Clock;
  private readonly cache = new Map<string, { readonly at: number; readonly value: unknown }>();

  constructor(
    private readonly inner: CourtDataSource,
    private readonly options: CacheOptions,
  ) {
    this.id = inner.id;
    this.clock = options.clock ?? systemClock;
  }

  private memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.clock.now();
    const hit = this.cache.get(key);
    if (hit && now - hit.at < this.options.ttlMs) {
      return Promise.resolve(hit.value as T);
    }
    const pending = load();
    void pending
      .then((value) => this.cache.set(key, { at: this.clock.now(), value }))
      .catch(() => {
        // don't cache failures
      });
    return pending;
  }

  getCaseByCnr: CourtDataSource["getCaseByCnr"] = (cnr) =>
    this.memo(`case:${cnr}`, () => this.inner.getCaseByCnr(cnr));
  getOrders: CourtDataSource["getOrders"] = (cnr) =>
    this.memo(`orders:${cnr}`, () => this.inner.getOrders(cnr));
  searchByParty: CourtDataSource["searchByParty"] = (query) =>
    this.memo(`party:${JSON.stringify(query)}`, () => this.inner.searchByParty(query));
  searchByCaseNumber: CourtDataSource["searchByCaseNumber"] = (query) =>
    this.memo(`caseno:${JSON.stringify(query)}`, () => this.inner.searchByCaseNumber(query));
  getCauseList: CourtDataSource["getCauseList"] = (query) =>
    this.memo(`cause:${JSON.stringify(query)}`, () => this.inner.getCauseList(query));
  getCaseByQr: CourtDataSource["getCaseByQr"] = (qrPayload) => this.inner.getCaseByQr(qrPayload);
}

export interface RateLimitOptions {
  readonly minIntervalMs: number;
  readonly clock?: Clock;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Serialises upstream calls and spaces their starts by at least `minIntervalMs`. */
export class RateLimitedCourtDataSource implements CourtDataSource {
  readonly id: SourceId;
  private readonly clock: Clock;
  private readonly sleep: (ms: number) => Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly inner: CourtDataSource,
    private readonly options: RateLimitOptions,
  ) {
    this.id = inner.id;
    this.clock = options.clock ?? systemClock;
    this.sleep = options.sleep ?? realSleep;
  }

  private throttle<T>(load: () => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => {
      const wait = this.lastStart + this.options.minIntervalMs - this.clock.now();
      if (wait > 0) {
        await this.sleep(wait);
      }
      this.lastStart = this.clock.now();
      return load();
    });
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  getCaseByCnr: CourtDataSource["getCaseByCnr"] = (cnr) =>
    this.throttle(() => this.inner.getCaseByCnr(cnr));
  getOrders: CourtDataSource["getOrders"] = (cnr) => this.throttle(() => this.inner.getOrders(cnr));
  getCaseByQr: CourtDataSource["getCaseByQr"] = (qrPayload) =>
    this.throttle(() => this.inner.getCaseByQr(qrPayload));
  searchByParty: CourtDataSource["searchByParty"] = (query) =>
    this.throttle(() => this.inner.searchByParty(query));
  searchByCaseNumber: CourtDataSource["searchByCaseNumber"] = (query) =>
    this.throttle(() => this.inner.searchByCaseNumber(query));
  getCauseList: CourtDataSource["getCauseList"] = (query) =>
    this.throttle(() => this.inner.getCauseList(query));
}

export interface ThrottleCacheOptions {
  readonly ttlMs?: number;
  readonly minIntervalMs?: number;
  readonly clock?: Clock;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * Wrap a source with rate-limiting (inner) and caching (outer), each applied only when its knob is
 * positive — so with no options it returns the source unchanged. A cache hit never reaches the
 * rate limiter.
 */
export function throttledCachingSource(
  inner: CourtDataSource,
  options: ThrottleCacheOptions,
): CourtDataSource {
  let source = inner;
  if (options.minIntervalMs && options.minIntervalMs > 0) {
    source = new RateLimitedCourtDataSource(source, {
      minIntervalMs: options.minIntervalMs,
      clock: options.clock,
      sleep: options.sleep,
    });
  }
  if (options.ttlMs && options.ttlMs > 0) {
    source = new CachingCourtDataSource(source, { ttlMs: options.ttlMs, clock: options.clock });
  }
  return source;
}
