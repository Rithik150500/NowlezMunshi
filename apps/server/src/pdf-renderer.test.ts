import { InMemoryBlobStore } from "@nowlez/storage";
import { describe, expect, it } from "vitest";
import { buildPdfjsRenderer } from "./pdf-renderer";

/** A byte-correct minimal 1-page PDF (blank 120x120) — valid xref, so pdfjs parses it cleanly. */
function minimalPdf(): Uint8Array {
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 120] >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

describe("buildPdfjsRenderer (real pdfjs-dist + @napi-rs/canvas)", () => {
  it("rasterises a real PDF into one PNG page image per page", async () => {
    const blobs = new InMemoryBlobStore();
    const src = await blobs.put(minimalPdf(), "application/pdf");

    const pages = await buildPdfjsRenderer(blobs).pdfToPageImages(src);

    expect(pages).toHaveLength(1);
    const [ref] = pages;
    if (!ref) {
      throw new Error("expected one page image");
    }
    expect(ref.contentType).toBe("image/png");
    const png = await blobs.get(ref);
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]); // PNG magic number
  });
});
