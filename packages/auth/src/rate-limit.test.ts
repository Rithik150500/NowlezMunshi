import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to max within the window, then reports exceeded", () => {
    const limiter = new RateLimiter({ max: 2, windowMs: 1000 });
    expect(limiter.exceeded("k", 0)).toBe(false);
    limiter.record("k", 0);
    limiter.record("k", 100);
    expect(limiter.exceeded("k", 200)).toBe(true);
  });

  it("forgets hits older than the window", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    limiter.record("k", 0);
    expect(limiter.exceeded("k", 500)).toBe(true);
    expect(limiter.exceeded("k", 1001)).toBe(false); // the 0-hit aged out
  });

  it("reset clears a key's history", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    limiter.record("k", 0);
    expect(limiter.exceeded("k", 1)).toBe(true);
    limiter.reset("k");
    expect(limiter.exceeded("k", 1)).toBe(false);
  });

  it("tracks keys independently", () => {
    const limiter = new RateLimiter({ max: 1, windowMs: 1000 });
    limiter.record("a", 0);
    expect(limiter.exceeded("a", 1)).toBe(true);
    expect(limiter.exceeded("b", 1)).toBe(false);
  });
});
