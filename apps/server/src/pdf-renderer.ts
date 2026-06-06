import { createCanvas } from "@napi-rs/canvas";
import type { BlobStore, DocumentRenderer } from "@nowlez/contracts";
import {
  type PageRasterizer,
  type PdfEngine,
  PdfjsDocumentRenderer,
  type PdfPage,
} from "@nowlez/rendering";
// pdfjs ships a browser-first main build that assumes DOM globals (DOMMatrix); the `legacy`
// build carries the Node polyfills. This thin adapter lives outside @nowlez/rendering so that
// package stays native-dependency-free and fully fake-tested (ADR-0008).
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildLibreOfficeDocxToPdf } from "./docx-converter";

/** Minimal structural view of the pdfjs PageProxy the rasteriser drives. */
interface PdfjsPage {
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
}

/**
 * The production wiring for the real `DocumentRenderer` (ADR-0008): inject pdfjs-dist (the Node
 * `legacy` build) as the PDF engine and `@napi-rs/canvas` as the page rasteriser, behind the same
 * port the rest of the system already uses. Construct it directly (it needs a BlobStore); the
 * `selectDocumentRenderer` kind-selector can't build it from a string alone.
 */
export function buildPdfjsRenderer(blobs: BlobStore): PdfjsDocumentRenderer {
  const engine: PdfEngine = {
    async getDocument(data) {
      // Hand pdfjs its own copy — it may transfer/detach the backing buffer.
      const doc = await getDocument({ data: new Uint8Array(data) }).promise;
      return {
        numPages: doc.numPages,
        getPage: (pageNumber) => doc.getPage(pageNumber) as unknown as Promise<PdfPage>,
      };
    },
  };

  const rasterize: PageRasterizer = async (page) => {
    const pdfPage = page as unknown as PdfjsPage;
    const viewport = pdfPage.getViewport({ scale: 2 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await pdfPage.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    return new Uint8Array(canvas.toBuffer("image/png"));
  };

  return new PdfjsDocumentRenderer({ blobs, engine, rasterize });
}

/**
 * The full production renderer: pdfjs for `pdfToPageImages`, LibreOffice (ADR-0005) for `docxToPdf`.
 * The docx path needs a `soffice` binary at runtime (set NOWLEZ_SOFFICE_PATH); page rasterisation
 * needs only the bundled pdfjs + canvas.
 */
export function buildOfficeRenderer(blobs: BlobStore): DocumentRenderer {
  const pages = buildPdfjsRenderer(blobs);
  const docxToPdf = buildLibreOfficeDocxToPdf({ blobs });
  return {
    pdfToPageImages: (pdf) => pages.pdfToPageImages(pdf),
    docxToPdf: (docx) => docxToPdf(docx),
  };
}
