import { describe, expect, it } from "vitest";
import { IngestionClassificationResultSchema, normalizationPathFor } from "./index";

describe("ingestion normalisation", () => {
  it("routes each format to page images", () => {
    expect(normalizationPathFor("pdf")).toEqual(["render-pdf-to-images"]);
    expect(normalizationPathFor("docx")).toEqual(["render-docx-to-pdf", "render-pdf-to-images"]);
    expect(normalizationPathFor("image")).toEqual(["passthrough-image"]);
  });
});

describe("ingestion classification result", () => {
  it("accepts well-formed metadata", () => {
    expect(
      IngestionClassificationResultSchema.safeParse({
        cnr: "X",
        documentType: "order",
        summary: "Bail granted.",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty CNR", () => {
    expect(
      IngestionClassificationResultSchema.safeParse({
        cnr: "",
        documentType: "order",
        summary: "Bail granted.",
      }).success,
    ).toBe(false);
  });
});
