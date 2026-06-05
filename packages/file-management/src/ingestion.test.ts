import { describe, expect, it } from "vitest";
import { IngestionPipeline } from "./index";

describe("IngestionPipeline (stub)", () => {
  it("knows the normalisation plan for each format now", () => {
    const p = new IngestionPipeline();
    expect(p.planNormalization("docx")).toEqual(["render-docx-to-pdf", "render-pdf-to-images"]);
  });

  it("defers rendering and classification to Phase 3", () => {
    const p = new IngestionPipeline();
    expect(() => p.normalize("pdf", { uri: "x", contentType: "application/pdf" })).toThrow(
      /Phase 3/,
    );
  });
});
