import { asCnr } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import {
  MockCourtDataSource,
  SAMPLE_CNR,
  selectCourtDataSource,
  selectCourtDataSourceFromEnv,
} from "./index";

describe("MockCourtDataSource", () => {
  const src = new MockCourtDataSource();

  it("returns a seeded case by CNR, with its orders", async () => {
    const c = await src.getCaseByCnr(SAMPLE_CNR);
    expect(c.cnr).toBe(SAMPLE_CNR);
    expect(c.orders.length).toBeGreaterThan(0);
  });

  it("throws for an unknown CNR", async () => {
    await expect(src.getCaseByCnr(asCnr("UNKNOWN"))).rejects.toThrow();
  });

  it("searches by party name, case-insensitively", async () => {
    const hits = await src.searchByParty({
      scope: { stateOrHighCourt: "Kerala" },
      partyName: "petitioner",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
  });

  it("builds a cause list for the requested day", async () => {
    const list = await src.getCauseList({
      scope: { stateOrHighCourt: "Kerala" },
      date: "2026-06-20",
    });
    expect(list[0]?.date).toBe("2026-06-20");
  });
});

describe("selectCourtDataSource", () => {
  it("defaults to the mock source", () => {
    expect(selectCourtDataSource().id).toBe("mock");
  });

  it("throws NotImplemented for real sources (Phase 6)", () => {
    expect(() => selectCourtDataSource("ecourts-web")).toThrow(/Phase 6/);
  });
});

describe("selectCourtDataSourceFromEnv", () => {
  it("defaults to mock when unset", () => {
    expect(selectCourtDataSourceFromEnv(undefined).id).toBe("mock");
  });

  it("rejects an unknown value", () => {
    expect(() => selectCourtDataSourceFromEnv("nope")).toThrow(/NOWLEZ_COURT_SOURCE/);
  });

  it("readies the seam: a valid-but-unbuilt source throws NotImplemented", () => {
    expect(() => selectCourtDataSourceFromEnv("ecourts-web")).toThrow(/Phase 6/);
  });
});
