/**
 * Rate limiting for the abuse-prone auth paths (docs/auth.md, ADR-0019): OTP requests (so a phone
 * can't be bombed with codes) and failed password sign-ins (to slow brute force). A simple in-memory
 * sliding window keyed by phone / email — **process-local**, like the pending-OTP map; a shared store
 * (e.g. Redis) for multi-instance deployments is a later port.
 */

/** Raised when an auth action exceeds its rate limit; the server maps it to HTTP 429. */
export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface RateLimitConfig {
  /** Allowed attempts within the window. */
  readonly max: number;
  /** The sliding window, in milliseconds. */
  readonly windowMs: number;
}

/** A per-key sliding-window counter. Times are passed in (the AuthService's injectable clock). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: RateLimitConfig) {}

  /** Whether `key` has already used its full allowance within the window (prunes old hits). */
  exceeded(key: string, now: number): boolean {
    return this.recent(key, now).length >= this.config.max;
  }

  /** Count an attempt against `key`. */
  record(key: string, now: number): void {
    const recent = this.recent(key, now);
    recent.push(now);
    this.hits.set(key, recent);
  }

  /** Forget a key's history — e.g. after a successful sign-in. */
  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    const pruned = (this.hits.get(key) ?? []).filter((at) => at > now - this.config.windowMs);
    this.hits.set(key, pruned);
    return pruned;
  }
}
