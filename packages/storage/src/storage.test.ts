import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FilesystemBlobStore, InMemoryBlobStore, selectBlobStore } from "./index";

describe("InMemoryBlobStore", () => {
  it("round-trips bytes by reference", async () => {
    const store = new InMemoryBlobStore();
    const ref = await store.put(new Uint8Array([1, 2, 3]), "application/octet-stream");
    expect(ref.contentType).toBe("application/octet-stream");
    expect([...(await store.get(ref))]).toEqual([1, 2, 3]);
  });
});

describe("FilesystemBlobStore", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nowlez-blobs-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists bytes to disk (readable by a fresh instance)", async () => {
    const ref = await new FilesystemBlobStore(dir).put(
      new Uint8Array([9, 8, 7]),
      "application/pdf",
    );
    expect([...(await new FilesystemBlobStore(dir).get(ref))]).toEqual([9, 8, 7]);
  });
});

describe("selectBlobStore", () => {
  it("defaults to memory; filesystem needs a dir", () => {
    expect(selectBlobStore().id).toBe("memory");
    expect(() => selectBlobStore("filesystem")).toThrow(/dir/);
  });
});
