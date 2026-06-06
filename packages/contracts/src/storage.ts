import type { BinaryRef } from "./binary";

/**
 * Object storage for binary content — the bytes a [`BinaryRef`](./binary.ts) points
 * at, and the "object storage" deferred in ADR-0007 / ADR-0014. Adapters live in
 * @nowlez/storage (in-memory + filesystem). `write_docx` stores its `.docx` here;
 * `read_docx` reads it back.
 */
export interface BlobStore {
  /** Which implementation this is (e.g. "memory", "filesystem"). */
  readonly id: string;
  /** Store bytes; returns a stable reference. */
  put(bytes: Uint8Array, contentType: string): Promise<BinaryRef>;
  /** Read bytes back by reference. */
  get(ref: BinaryRef): Promise<Uint8Array>;
}
