import { describe, expect, it } from "vitest";
import { FakeDocumentRenderer, selectDocumentRenderer } from "./index";

const pdf = { uri: "mock://o1.pdf", contentType: "application/pdf" };

describe("FakeDocumentRenderer", () => {
  it("renders a PDF to one page image per page", async () => {
    const pages = await new FakeDocumentRenderer(3).pdfToPageImages(pdf);
    expect(pages).toHaveLength(3);
    expect(pages[0]?.contentType).toBe("image/png");
    expect(pages[0]?.uri).toContain("#page=1");
  });

  it("renders a docx to a PDF preview", async () => {
    const preview = await new FakeDocumentRenderer().docxToPdf({
      uri: "mock://draft.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(preview.contentType).toBe("application/pdf");
    expect(preview.uri).toContain(".preview.pdf");
  });
});

describe("selectDocumentRenderer", () => {
  it("defaults to the fake; pdfjs must be constructed directly with deps", () => {
    expect(selectDocumentRenderer()).toBeInstanceOf(FakeDocumentRenderer);
    expect(() => selectDocumentRenderer("pdfjs")).toThrow(/PdfjsDocumentRenderer/);
  });
});
