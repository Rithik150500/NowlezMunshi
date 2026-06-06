/**
 * Document rendering port (ADR-0008). Turns documents into the forms the rest of
 * NowLez needs: PDFs into page images (for the ingestion vision model), and Word
 * documents into a PDF preview (the shared docx-to-preview path used by both
 * ingestion and the Munshi's write-docx pipeline).
 *
 * The real rasteriser is named in ADR-0008 and lands when real document bytes
 * flow (Phase 3/6); a deterministic fake backs dev and tests until then.
 * Adapters live in @nowlez/rendering.
 */
import type { BinaryRef } from "./binary";

export interface DocumentRenderer {
  /** Render a PDF to one page-image reference per page. */
  pdfToPageImages(pdf: BinaryRef): Promise<readonly BinaryRef[]>;
  /** Render a Word document to a PDF preview. */
  docxToPdf(docx: BinaryRef): Promise<BinaryRef>;
}
