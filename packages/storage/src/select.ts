import type { BlobStore } from "@nowlez/contracts";
import { FilesystemBlobStore } from "./file";
import { InMemoryBlobStore } from "./in-memory";

export type BlobStoreKind = "memory" | "filesystem";

export interface BlobStoreOptions {
  /** Required when kind is "filesystem": directory to write blobs into. */
  dir?: string;
}

/**
 * Select a BlobStore implementation (ADR-0014). The default is the in-memory
 * store; switching to durable storage is changing the kind here.
 */
export function selectBlobStore(
  kind: BlobStoreKind = "memory",
  options: BlobStoreOptions = {},
): BlobStore {
  switch (kind) {
    case "memory":
      return new InMemoryBlobStore();
    case "filesystem": {
      if (!options.dir) {
        throw new Error('selectBlobStore("filesystem") requires options.dir');
      }
      return new FilesystemBlobStore(options.dir);
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled blob store kind: ${String(x)}`);
}
