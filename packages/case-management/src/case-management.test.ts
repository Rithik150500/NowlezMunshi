import { asCnr } from "@nowlez/contracts";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { describe, expect, it } from "vitest";
import { CaseManagement } from "./index";

describe("CaseManagement — add-case-by-CNR slice", () => {
  it("adds a case by CNR through the mock source: tracked, with raw orders", async () => {
    const cm = new CaseManagement();
    const c = await cm.addCaseByCnr(SAMPLE_CNR);

    expect(c.cnr).toBe(SAMPLE_CNR);
    expect(c.tracking).toBe(true);
    expect(c.orders.length).toBeGreaterThan(0);
    // Orders arrive raw; ingestion (Phase 3) fills page images + the summary.
    expect(c.orders[0]?.pageImages).toEqual([]);
    expect(c.orders[0]?.summary).toBe("");
    expect(c.orders[0]?.sourcePdf.contentType).toBe("application/pdf");
  });

  it("stores the added case so it can be read back", async () => {
    const cm = new CaseManagement();
    await cm.addCaseByCnr(SAMPLE_CNR);

    expect(cm.getCase(SAMPLE_CNR)?.cnr).toBe(SAMPLE_CNR);
    expect(cm.listCases()).toHaveLength(1);
  });

  it("adds by QR (mock resolves the payload to a CNR)", async () => {
    const cm = new CaseManagement();
    const c = await cm.addCaseByQr(SAMPLE_CNR);
    expect(c.cnr).toBe(SAMPLE_CNR);
  });

  it("toggles tracking on a stored case", async () => {
    const cm = new CaseManagement();
    await cm.addCaseByCnr(SAMPLE_CNR);
    await cm.setTracking(SAMPLE_CNR, false);
    expect(cm.getCase(SAMPLE_CNR)?.tracking).toBe(false);
  });

  it("rejects setTracking on a case that was never added", async () => {
    await expect(new CaseManagement().setTracking(asCnr("NOPE"), true)).rejects.toThrow();
  });

  it("rejects an unknown CNR (error propagated from the source)", async () => {
    await expect(new CaseManagement().addCaseByCnr(asCnr("NOPE"))).rejects.toThrow();
  });

  it("wires to the mock source by default and accepts an injected one", () => {
    expect(new CaseManagement().sourceId).toBe("mock");
    expect(new CaseManagement(new MockCourtDataSource()).sourceId).toBe("mock");
  });

  it("still defers the cause-list cross-reference to Phase 6", () => {
    expect(() => new CaseManagement().getCauseListForUser("2026-06-20")).toThrow(/Phase 6/);
  });
});
