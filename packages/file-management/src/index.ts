import {
  type BinaryRef,
  type IngestionClassificationRequest,
  type IngestionClassificationResult,
  type NormalizationStep,
  NotImplementedError,
  normalizationPathFor,
  type UploadFormat,
} from "@nowlez/contracts";

/**
 * File Management / ingestion pipeline (stub) — normalise any document to page
 * images, then classify & summarise with the smaller Gemma model
 * (docs/file-management.md). Rendering and the model call land in Phase 3.
 */
export class IngestionPipeline {
  /** Step 1's plan is fixed by format and known today; rendering lands in Phase 3. */
  planNormalization(format: UploadFormat): readonly NormalizationStep[] {
    return normalizationPathFor(format);
  }

  normalize(_format: UploadFormat, _original: BinaryRef): Promise<readonly BinaryRef[]> {
    throw new NotImplementedError("IngestionPipeline.normalize", "Phase 3");
  }

  classify(_request: IngestionClassificationRequest): Promise<IngestionClassificationResult> {
    throw new NotImplementedError("IngestionPipeline.classify", "Phase 3");
  }
}
