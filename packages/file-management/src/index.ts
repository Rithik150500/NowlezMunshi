import {
  asCnr,
  type BinaryRef,
  type CaseMiniDetail,
  type DocumentRenderer,
  type FileDocument,
  type IngestionClassificationRequest,
  type IngestionClassificationResult,
  IngestionClassificationResultSchema,
  type ModelClient,
  type NormalizationStep,
  newFileId,
  normalizationPathFor,
  type Order,
  parseModelJson,
  type UploadFormat,
  uploadFormatFor,
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
    const parsed = parseModelJson(result.text, IngestionClassificationResultSchema);
    return { cnr: asCnr(parsed.cnr), documentType: parsed.documentType, summary: parsed.summary };
  }

  /**
   * Ingest one stored File end to end: normalise its bytes to page images, classify
   * & summarise them, and return the File enriched with `pageImages`, `documentType`,
   * and `summary`. The File stays on its own case (its `cnr` is kept); persistence is
   * the caller's job.
   */
  async ingest(file: FileDocument, context: readonly CaseMiniDetail[]): Promise<FileDocument> {
    const format = uploadFormatFor(file.original.contentType);
    const pageImages = await this.normalize(format, file.original);
    const { documentType, summary } = await this.classify({ kind: "file", pageImages, context });
    return { ...file, pageImages, documentType, summary };
  }

  /**
   * Ingest an uploaded document whose case is unknown (e.g. a WhatsApp upload): normalise
   * it, then classify it — which identifies the CNR it belongs to, its document type, and a
   * summary — and return a ready-to-attach `user-uploaded` File. The caller verifies the CNR
   * is a known case and persists it.
   */
  async ingestUpload(
    original: BinaryRef,
    context: readonly CaseMiniDetail[],
  ): Promise<FileDocument> {
    const format = uploadFormatFor(original.contentType);
    const pageImages = await this.normalize(format, original);
    const { cnr, documentType, summary } = await this.classify({
      kind: "file",
      pageImages,
      context,
    });
    return {
      id: newFileId(),
      cnr,
      original,
      pageImages,
      documentType,
      summary,
      origin: "user-uploaded",
    };
  }

  /**
   * Ingest a court Order (always a PDF): normalise its source to page images and
   * summarise them, returning the Order enriched with `pageImages` and `summary`.
   */
  async ingestOrder(order: Order, context: readonly CaseMiniDetail[]): Promise<Order> {
    const pageImages = await this.normalize(
      uploadFormatFor(order.sourcePdf.contentType),
      order.sourcePdf,
    );
    const { summary } = await this.classify({ kind: "order", pageImages, context });
    return { ...order, pageImages, summary };
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled upload format: ${String(x)}`);
}
