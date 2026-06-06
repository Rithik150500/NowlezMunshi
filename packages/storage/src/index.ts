/**
 * @nowlez/storage — BlobStore adapters (ADR-0014). An in-memory store is the
 * default; the filesystem store is durable. The bytes a BinaryRef points at live
 * here (e.g. the .docx produced by write_docx).
 */
export { FilesystemBlobStore } from "./file";
export { InMemoryBlobStore } from "./in-memory";
export { type BlobStoreKind, type BlobStoreOptions, selectBlobStore } from "./select";
