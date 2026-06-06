import { asCnr, asFileId, type FileDocument } from "@nowlez/contracts";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { describe, expect, it } from "vitest";
import { CaseManagement } from "./index";

describe("CaseManagement — add a case", () => {
  it("adds by CNR: tracked, persisted, with raw orders", async () => {
    const cm = new CaseManagement();
    const c = await cm.addCaseByCnr(SAMPLE_CNR);

    expect(c.cnr).toBe(SAMPLE_CNR);
    expect(c.tracking).toBe(true);
    // Orders arrive raw; ingestion (Phase 3) fills page images + the summary.
    expect(c.orders[0]?.pageImages).toEqual([]);
    expect(c.orders[0]?.summary).toBe("");
    expect((await cm.getCase(SAMPLE_CNR))?.cnr).toBe(SAMPLE_CNR);
    expect(await cm.listCases()).toHaveLength(1);
  });

  it("adds by QR and toggles tracking", async () => {
    const cm = new CaseManagement();
    await cm.addCaseByQr(SAMPLE_CNR);
    await cm.setTracking(SAMPLE_CNR, false);
    expect((await cm.getCase(SAMPLE_CNR))?.tracking).toBe(false);
  });

  it("rejects an unknown CNR and setTracking on a case never added", async () => {
    const cm = new CaseManagement();
    await expect(cm.addCaseByCnr(asCnr("NOPE"))).rejects.toThrow();
    await expect(cm.setTracking(asCnr("NOPE"), true)).rejects.toThrow();
  });
});

describe("CaseManagement — read paths", () => {
  it("searches by party through the source", async () => {
    const hits = await new CaseManagement().searchByParty({
      scope: { stateOrHighCourt: "Kerala" },
      partyName: "petitioner",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
  });

  it("searches by case number through the source", async () => {
    const hits = await new CaseManagement().searchByCaseNumber({
      scope: { stateOrHighCourt: "Kerala" },
      caseType: "OS",
      caseNumber: "1234",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
  });

  it("cross-references the cause list against tracked cases only", async () => {
    const cm = new CaseManagement();
    // Nothing tracked yet -> empty.
    expect(await cm.getCauseListForUser("2026-06-20")).toHaveLength(0);

    await cm.addCaseByCnr(SAMPLE_CNR);
    const list = await cm.getCauseListForUser("2026-06-20");
    expect(list).toHaveLength(1);
    expect(list[0]?.cnr).toBe(SAMPLE_CNR);

    // Untracking the case removes it from the user's cause list.
    await cm.setTracking(SAMPLE_CNR, false);
    expect(await cm.getCauseListForUser("2026-06-20")).toHaveLength(0);
  });

  it("derives mini-details (the Munshi's context) from added cases", async () => {
    const cm = new CaseManagement();
    expect(await cm.listMiniDetails()).toHaveLength(0);

    await cm.addCaseByCnr(SAMPLE_CNR);
    const mini = await cm.listMiniDetails();
    expect(mini).toHaveLength(1);
    expect(mini[0]?.cnr).toBe(SAMPLE_CNR);
    // Mini-details carry the case's orders (with IDs, so the Munshi can cite + read them).
    expect(mini[0]?.orders).toHaveLength((await cm.getCase(SAMPLE_CNR))?.orders.length ?? -1);
  });

  it("attaches a file to a case and finds it back by id", async () => {
    const cm = new CaseManagement();
    await cm.addCaseByCnr(SAMPLE_CNR);
    const file: FileDocument = {
      id: asFileId("UP1"),
      cnr: SAMPLE_CNR,
      original: { uri: "blob:x", contentType: "application/pdf", bytes: 3 },
      pageImages: [],
      documentType: "evidence",
      summary: "",
      origin: "user-uploaded",
    };
    await cm.attachFile(SAMPLE_CNR, file);

    expect((await cm.getCase(SAMPLE_CNR))?.files).toHaveLength(1);
    expect((await cm.findFile("UP1"))?.origin).toBe("user-uploaded");
    await expect(cm.attachFile(asCnr("NOPE"), file)).rejects.toThrow();
  });

  it("wires to the mock source by default and accepts an injected one", () => {
    expect(new CaseManagement().sourceId).toBe("mock");
    expect(new CaseManagement(new MockCourtDataSource()).sourceId).toBe("mock");
  });
});
