import { describe, expect, it } from "vitest";
import { Munshi } from "./index";

describe("Munshi (stub)", () => {
  it("exposes the six tools today", () => {
    expect(new Munshi().tools()).toHaveLength(6);
  });

  it("defers the agent loop to Phase 4", () => {
    expect(() => new Munshi().assembleContext([])).toThrow(/Phase 4/);
  });
});
