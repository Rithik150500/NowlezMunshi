import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BinaryRef, BlobStore } from "@nowlez/contracts";

/** A durable, dependency-free BlobStore that writes each blob to a file in `dir`. */
export class FilesystemBlobStore implements BlobStore {
  readonly id = "filesystem";

  constructor(private readonly dir: string) {}

  async put(bytes: Uint8Array, contentType: string): Promise<BinaryRef> {
    await mkdir(this.dir, { recursive: true });
    const key = randomUUID();
    await writeFile(join(this.dir, key), bytes);
    return { uri: `blob:${key}`, contentType, bytes: bytes.length };
  }

  async get(ref: BinaryRef): Promise<Uint8Array> {
    const key = ref.uri.replace(/^blob:/, "");
    return new Uint8Array(await readFile(join(this.dir, key)));
  }
}
