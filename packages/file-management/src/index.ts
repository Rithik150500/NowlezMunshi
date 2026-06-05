import {
  type BinaryRef,
  type DocumentRenderer,
  type IngestionClassificationRequest,
  type IngestionClassificationResult,
  type NormalizationStep,
  NotImplementedError,
  normalizationPathFor,
  type UploadFormat,
} from "@nowlez/contracts";
import { selectDocumentRenderer } from "@nowlez/rendering";

/**
 * File Management / ingestion pipeline (docs/file-management.md).
 *
 * Phase 2: **normalisation** is implemented — every format is turned into page
 * images via the DocumentRenderer port (ADR-0008), which uses a deterministic
 * fake until real document bytes flow. Step 2 (classification with the smaller
 * Gemma model) lands in Phase 3.
 */
export class IngestionPipeline {
  constructor(private readonly renderer: DocumentRenderer = selectDocumentRenderer()) {}

  /** The per-format normalisation plan (fixed by format, independent of rendering). */
  planNormalization(format: UploadFormat): readonly NormalizationStep[] {
    return normalizationPathFor(format);
  }

  /** Turn a document into page images — a vision model reads them. */
  async normalize(format: UploadFormat, original: BinaryRef): Promise<readonly BinaryRef[]> {
    switch (format) {
      case "pdf":
        return this.renderer.pdfToPageImages(original);
      case "docx": {
        const preview = await this.renderer.docxToPdf(original);
        return this.renderer.pdfToPageImages(preview);
      }
      case "image":
        // Already a page image — passes straight through.
        return [original];
      default:
        return assertNever(format);
    }
  }

  classify(_request: IngestionClassificationRequest): Promise<IngestionClassificationResult> {
    throw new NotImplementedError("IngestionPipeline.classify", "Phase 3");
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled upload format: ${String(x)}`);
}
