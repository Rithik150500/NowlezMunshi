import { asCnr } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { DEFAULT_MUNSHI_INSTRUCTIONS, Munshi } from "./index";

describe("Munshi", () => {
  it("exposes the six tools", () => {
    expect(new Munshi().tools()).toHaveLength(6);
  });

  it("assembles a context package from mini-details + default instructions", () => {
    const ctx = new Munshi().assembleContext([
      {
        cnr: asCnr("KLER010012342026"),
        court: {
          stateOrHighCourt: "Kerala",
          districtOrBench: "Ernakulam",
          court: "Principal District & Sessions Court",
        },
        orders: [],
        files: [],
      },
    ]);
    expect(ctx.miniDetails).toHaveLength(1);
    expect(ctx.instructions).toBe(DEFAULT_MUNSHI_INSTRUCTIONS);
    expect(ctx.instructions.inlineCitation.length).toBeGreaterThan(0);
  });

  it("defers the tool-calling loop to Phase 4 (needs the model)", () => {
    const m = new Munshi();
    expect(() => m.run("hello", m.assembleContext([]))).toThrow(/Phase 4/);
  });
});
