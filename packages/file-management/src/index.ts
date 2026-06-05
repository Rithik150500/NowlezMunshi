import {
  asCnr,
  type BinaryRef,
  type CaseMiniDetail,
  type DocumentRenderer,
  type IngestionClassificationRequest,
  type IngestionClassificationResult,
  IngestionClassificationResultSchema,
  type ModelClient,
  type NormalizationStep,
  normalizationPathFor,
  type UploadFormat,
} from "@nowlez/contracts";
import { selectModelClient } from "@nowlez/model";
import { selectDocumentRenderer } from "@nowlez/rendering";

const INGESTION_SYSTEM_PROMPT =
  'You classify a legal document for an Indian advocate. From the page images and the existing case summaries, identify the CNR the document belongs to, its document type, and a concise descriptive summary. Respond as strict JSON: {"cnr": string, "documentType": string, "summary": string}.';

function summariseContext(context: readonly CaseMiniDetail[]): string {
  if (context.length === 0) {
    return "No existing cases.";
  }
  return context
    .map(
      (c) => `CNR ${c.cnr} (${c.court.court}): ${c.orders.length} orders, ${c.files.length} files.`,
    )
    .join("\n");
}

/**
 * File Management / ingestion pipeline (docs/file-management.md).
 *
 * Phase 2: normalisation (format -> page images) via the DocumentRenderer port.
 * Phase 3: classification via the smaller Gemma model through the ModelClient
 * port (ADR-0009). Both run against deterministic fakes until a real renderer /
 * model endpoint and real document bytes are wired in.
 */
export class IngestionPipeline {
  constructor(
    private readonly renderer: DocumentRenderer = selectDocumentRenderer(),
    private readonly model: ModelClient = selectModelClient(),
  ) {}

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
        return [original];
      default:
        return assertNever(format);
    }
  }

  /**
   * Classify & summarise a normalised document with the smaller Gemma model: the
   * page images plus the existing case mini-details go in; the CNR, document type,
   * and a descriptive summary come back (validated).
   */
  async classify(request: IngestionClassificationRequest): Promise<IngestionClassificationResult> {
    const result = await this.model.complete({
      model: "small",
      responseFormat: "json",
      messages: [
        { role: "system", content: INGESTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Existing cases:\n${summariseContext(request.context)}`,
          images: request.pageImages,
        },
      ],
    });
    const parsed = IngestionClassificationResultSchema.parse(JSON.parse(result.text));
    return { cnr: asCnr(parsed.cnr), documentType: parsed.documentType, summary: parsed.summary };
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled upload format: ${String(x)}`);
}
