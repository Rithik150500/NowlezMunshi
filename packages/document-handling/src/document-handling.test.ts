import { describe, expect, it } from "vitest";
import { DocxPipeline, VIEWER_CONTENT_TYPES } from "./index";

describe("Document handling (stub)", () => {
  it("serves three viewer content types", () => {
    expect(VIEWER_CONTENT_TYPES).toEqual(["pdf", "docx", "image"]);
  });

  it("defers the docx pipeline to Phase 5", () => {
    expect(() => new DocxPipeline().compile("(doc) => doc")).toThrow(/Phase 5/);
  });
});
