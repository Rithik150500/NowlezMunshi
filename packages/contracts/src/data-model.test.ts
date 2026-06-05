import { describe, expect, it } from "vitest";
import { asCnr, type Case } from "./index";

describe("data model", () => {
  it("builds a Case keyed by its CNR", () => {
    const c: Case = {
      cnr: asCnr("KLER010012342026"),
      court: {
        stateOrHighCourt: "Kerala",
        districtOrBench: "Ernakulam",
        court: "Principal District & Sessions Court",
      },
      details: { parties: "A vs B", year: 2026 },
      tracking: true,
      orders: [],
      files: [],
    };
    expect(c.cnr).toBe("KLER010012342026");
    expect(c.tracking).toBe(true);
  });

  it("rejects an empty CNR", () => {
    expect(() => asCnr("   ")).toThrow();
  });
});
