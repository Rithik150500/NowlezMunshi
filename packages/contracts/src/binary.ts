/**
 * An opaque reference to stored binary content — a source PDF, a derived page
 * image, an uploaded original. WHERE the bytes live (database blob vs. object
 * storage) and how page images are keyed are open questions
 * (open-questions.md#data-model); the rest of the system only needs a stable
 * reference plus its content type.
 */
export interface BinaryRef {
  /** Stable locator for the content (storage scheme TBD). */
  readonly uri: string;
  /** MIME type, e.g. "application/pdf", "image/png", "image/webp". */
  readonly contentType: string;
  /** Size in bytes, when known. */
  readonly bytes?: number;
}
