import { describe, expect, it } from "vitest";
import { asCnr, asFileId, asOrderId, type Case, toMiniDetail } from "./index";

const sampleCase = (): Case => ({
  cnr: asCnr("KLER010012342026"),
  court: {
    stateOrHighCourt: "Kerala",
    districtOrBench: "Ernakulam",
    court: "Principal District & Sessions Court",
  },
  details: { parties: "A vs B", year: 2026 },
  tracking: true,
  orders: [
    {
      id: asOrderId("O1"),
      cnr: asCnr("KLER010012342026"),
      sourcePdf: { uri: "mock://o1.pdf", contentType: "application/pdf" },
      pageImages: [],
      summary: "Bail granted.",
    },
  ],
  files: [
    {
      id: asFileId("F1"),
      cnr: asCnr("KLER010012342026"),
      original: { uri: "mock://f1.docx", contentType: "application/octet-stream" },
      pageImages: [],
      documentType: "petition",
      summary: "Petition for bail.",
      origin: "user-uploaded",
    },
  ],
});

describe("data model", () => {
  it("builds a Case keyed by its CNR", () => {
    const c = sampleCase();
    expect(c.cnr).toBe("KLER010012342026");
    expect(c.tracking).toBe(true);
  });

  it("rejects an empty CNR", () => {
    expect(() => asCnr("   ")).toThrow();
  });

  it("derives the compact mini-detail from a case", () => {
    const md = toMiniDetail(sampleCase());
    expect(md.cnr).toBe("KLER010012342026");
    expect(md.orders).toEqual([{ id: "O1", summary: "Bail granted." }]);
    expect(md.files).toEqual([
      { id: "F1", documentType: "petition", summary: "Petition for bail." },
    ]);
  });
});
