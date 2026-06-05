import { asCnr } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { CaseManagement } from "./index";

describe("CaseManagement (stub)", () => {
  it("wires through to a court-data source (mock by default)", () => {
    expect(new CaseManagement().sourceId).toBe("mock");
  });

  it("throws NotImplemented until Phase 2", () => {
    expect(() => new CaseManagement().addCaseByCnr(asCnr("X"))).toThrow(/Phase 2/);
  });
});
