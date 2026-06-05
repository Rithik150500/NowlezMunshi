import { type BinaryRef, NotImplementedError } from "@nowlez/contracts";

/** The three kinds of content the viewer handles, for both Orders and Files. */
export type ViewerContentType = "pdf" | "docx" | "image";
export const VIEWER_CONTENT_TYPES: readonly ViewerContentType[] = ["pdf", "docx", "image"];

/**
 * The docx generation pipeline (stub): docx-js code -> .docx -> PDF preview
 * (docs/document-handling.md, ADR-0005) — the same docx-to-preview rendering the
 * ingestion pipeline uses. Lands in Phase 5.
 */
export class DocxPipeline {
  /** Compile docx-js code into a .docx file. */
  compile(_docxJsCode: string): Promise<BinaryRef> {
    throw new NotImplementedError("DocxPipeline.compile", "Phase 5");
  }

  /** Render a .docx to a PDF preview, for display and for feeding back to the Munshi. */
  renderPdfPreview(_docx: BinaryRef): Promise<BinaryRef> {
    throw new NotImplementedError("DocxPipeline.renderPdfPreview", "Phase 5");
  }
}
