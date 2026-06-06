/**
 * The File Management / ingestion pipeline contract (docs/file-management.md).
 * Step 1 normalises any artifact into page images; step 2 feeds those images
 * (plus case mini-details as context) to the smaller Gemma model, which returns
 * structured metadata.
 *
 * The page-image resolution and the EXACT prompt/response schema for the Gemma
 * call are open questions (open-questions.md#file-management); the shapes here
 * are the structural contract.
 */
import { z } from "zod";
import type { BinaryRef } from "./binary";
import type { Cnr } from "./brands";
import type { CaseMiniDetail } from "./data-model";

/** What an incoming artifact is, for routing through normalisation. */
export type SourceKind = "order" | "file";

/** Upload formats the pipeline accepts (orders always arrive as PDF). */
export type UploadFormat = "pdf" | "docx" | "image";

/** A single step in turning an artifact into page images. */
export type NormalizationStep = "render-pdf-to-images" | "render-docx-to-pdf" | "passthrough-image";

/**
 * The per-format normalisation route — everything becomes page images because
 * a vision model reads them (file-management.md step 1):
 *  - PDF (order or general) -> render to page images directly
 *  - doc/docx               -> render to a PDF preview, then to page images
 *  - image                  -> passes straight through
 */
export const NORMALIZATION_PATHS: Record<UploadFormat, readonly NormalizationStep[]> = {
  pdf: ["render-pdf-to-images"],
  docx: ["render-docx-to-pdf", "render-pdf-to-images"],
  image: ["passthrough-image"],
};

export function normalizationPathFor(format: UploadFormat): readonly NormalizationStep[] {
  return NORMALIZATION_PATHS[format];
}

/** Map a stored file's MIME type to the upload format that routes its normalisation. */
export function uploadFormatFor(contentType: string): UploadFormat {
  if (contentType === "application/pdf") {
    return "pdf";
  }
  if (
    contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    contentType === "application/msword"
  ) {
    return "docx";
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }
  throw new Error(`Unsupported content type for ingestion: ${contentType}`);
}

/**
 * Input to the smaller-Gemma classification call: the normalised page images
 * plus case mini-details (existing order & file summaries) as context, so the
 * model can place the document in the right case and relate it to what's there.
 */
export interface IngestionClassificationRequest {
  readonly kind: SourceKind;
  readonly pageImages: readonly BinaryRef[];
  readonly context: readonly CaseMiniDetail[];
}

/**
 * Structured metadata the model returns: the CNR the document belongs to, its
 * document type, and a descriptive summary. For an Order, the summary is the
 * order summary.
 */
export interface IngestionClassificationResult {
  readonly cnr: Cnr;
  readonly documentType: string;
  readonly summary: string;
}

/** Runtime schema for validating the model's output (the response half). */
export const IngestionClassificationResultSchema = z.object({
  cnr: z.string().min(1),
  documentType: z.string().min(1),
  summary: z.string().min(1),
});
