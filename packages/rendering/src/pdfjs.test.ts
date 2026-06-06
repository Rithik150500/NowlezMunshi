import type { BlobStore } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { type PdfEngine, PdfjsDocumentRenderer } from "./index";

/** A minimal in-memory BlobStore for the renderer's load (source) + store (page images). */
function memBlobs(): BlobStore {
  const map = new Map<string, Uint8Array>();
  let n = 0;
  return {
    id: "fake",
    async put(bytes, contentType) {
      const uri = `blob:${n++}`;
      map.set(uri, bytes);
      return { uri, contentType, bytes: bytes.length };
    },
    async get(ref) {
      const found = map.get(ref.uri);
      if (!found) {
        throw new Error(`no blob ${ref.uri}`);
      }
      return found;
    },
  };
}

/** A fake PDF engine: a 2-page document. */
const engine: PdfEngine = {
  getDocument: async () => ({
    numPages: 2,
    getPage: async (pageNumber) => ({ pageNumber }),
  }),
};

/** A fake rasteriser: PNG bytes that encode the page number, so we can assert per-page output. */
const rasterize = async (page: { pageNumber: number }): Promise<Uint8Array> =>
  new Uint8Array([page.pageNumber]);

describe("PdfjsDocumentRenderer", () => {
  it("renders each PDF page to a stored PNG", async () => {
    const blobs = memBlobs();
    const source = await blobs.put(new Uint8Array([1, 2, 3]), "application/pdf");
    const renderer = new PdfjsDocumentRenderer({ blobs, engine, rasterize });

    const images = await renderer.pdfToPageImages(source);

    expect(images).toHaveLength(2);
    const first = images[0];
    const second = images[1];
    expect(first?.contentType).toBe("image/png");
    if (first && second) {
      expect([...(await blobs.get(first))]).toEqual([1]); // page 1
      expect([...(await blobs.get(second))]).toEqual([2]); // page 2
    }
  });

  it("does not convert docx (needs an office converter)", async () => {
    const renderer = new PdfjsDocumentRenderer({ blobs: memBlobs(), engine, rasterize });
    await expect(
      renderer.docxToPdf({ uri: "x", contentType: "application/octet-stream" }),
    ).rejects.toThrow(/converter/);
  });
});
