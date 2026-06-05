import type { BinaryRef, DocumentRenderer } from "@nowlez/contracts";

/**
 * A deterministic, dependency-free DocumentRenderer for development and tests.
 * It does not rasterise real bytes — it derives stable page-image / preview
 * references from the source reference, which is enough to exercise the
 * ingestion and docx pipelines end to end until real document bytes flow (the
 * real rasteriser is named in ADR-0008).
 */
export class FakeDocumentRenderer implements DocumentRenderer {
  constructor(private readonly pageCount = 1) {}

  async pdfToPageImages(pdf: BinaryRef): Promise<readonly BinaryRef[]> {
    return Array.from({ length: this.pageCount }, (_unused, i) => ({
      uri: `${pdf.uri}#page=${i + 1}`,
      contentType: "image/png",
    }));
  }

  async docxToPdf(docx: BinaryRef): Promise<BinaryRef> {
    return { uri: `${docx.uri}.preview.pdf`, contentType: "application/pdf" };
  }
}
