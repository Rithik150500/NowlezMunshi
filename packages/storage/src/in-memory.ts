import { randomUUID } from "node:crypto";
import type { BinaryRef, BlobStore } from "@nowlez/contracts";

/** The default BlobStore: a process-lifetime in-memory store. */
export class InMemoryBlobStore implements BlobStore {
  readonly id = "memory";
  private readonly blobs = new Map<string, Uint8Array>();

  async put(bytes: Uint8Array, contentType: string): Promise<BinaryRef> {
    const key = randomUUID();
    this.blobs.set(key, bytes);
    return { uri: `blob:${key}`, contentType, bytes: bytes.length };
  }

  async get(ref: BinaryRef): Promise<Uint8Array> {
    const found = this.blobs.get(ref.uri.replace(/^blob:/, ""));
    if (!found) {
      throw new Error(`InMemoryBlobStore: no blob for ${ref.uri}`);
    }
    return found;
  }
}
