import { asCnr, type CourtDataSource, type FetchedCase } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import {
  CachingCourtDataSource,
  type Clock,
  RateLimitedCourtDataSource,
  throttledCachingSource,
} from "./index";

const CNR = asCnr("KLER010012342026");
const QUERY = { scope: { stateOrHighCourt: "Kerala" }, date: "2026-06-20" };

function fetched(): FetchedCase {
  return {
    cnr: CNR,
    court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
    details: {},
    orders: [],
  };
}

/** A CourtDataSource that counts the upstream calls under test. */
function countingSource() {
  let cnrCalls = 0;
  let causeCalls = 0;
  const source: CourtDataSource = {
    id: "mock",
    getCaseByCnr: async () => {
      cnrCalls += 1;
      return fetched();
    },
    getOrders: async () => [],
    getCaseByQr: async () => fetched(),
    searchByParty: async () => [],
    searchByCaseNumber: async () => [],
    getCauseList: async () => {
      causeCalls += 1;
      return [];
    },
  };
  return {
    source,
    calls: () => ({ cnrCalls, causeCalls }),
  };
}

describe("CachingCourtDataSource", () => {
  it("serves within TTL, refetches after expiry, and preserves the id", async () => {
    const { source, calls } = countingSource();
    let t = 0;
    const clock: Clock = { now: () => t };
    const cached = new CachingCourtDataSource(source, { ttlMs: 1000, clock });

    expect(cached.id).toBe("mock");
    await cached.getCaseByCnr(CNR); // miss
    await cached.getCaseByCnr(CNR); // hit
    expect(calls().cnrCalls).toBe(1);

    t = 1500;
    await cached.getCaseByCnr(CNR); // expired -> miss
    expect(calls().cnrCalls).toBe(2);
  });
});

describe("RateLimitedCourtDataSource", () => {
  it("spaces upstream calls by at least minIntervalMs (first call free)", async () => {
    const { source } = countingSource();
    let t = 0;
    const sleeps: number[] = [];
    const clock: Clock = { now: () => t };
    const sleep = async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    };
    const limited = new RateLimitedCourtDataSource(source, { minIntervalMs: 100, clock, sleep });

    await Promise.all([
      limited.getCauseList(QUERY),
      limited.getCauseList(QUERY),
      limited.getCauseList(QUERY),
    ]);
    expect(sleeps).toEqual([100, 100]);
  });
});

describe("throttledCachingSource", () => {
  it("returns the source unchanged when no knobs are set", () => {
    const { source } = countingSource();
    expect(throttledCachingSource(source, {})).toBe(source);
  });

  it("caches when a TTL is set", async () => {
    const { source, calls } = countingSource();
    const wrapped = throttledCachingSource(source, { ttlMs: 1000, clock: { now: () => 0 } });
    await wrapped.getCaseByCnr(CNR);
    await wrapped.getCaseByCnr(CNR);
    expect(calls().cnrCalls).toBe(1);
  });
});
