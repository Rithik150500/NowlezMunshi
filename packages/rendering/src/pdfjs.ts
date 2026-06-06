import {
  type BinaryRef,
  type BlobStore,
  type DocumentRenderer,
  NotImplementedError,
} from "@nowlez/contracts";

/**
 * The real DocumentRenderer (ADR-0008): it drives a **PDF engine** and a **page rasteriser** to
 * turn a stored PDF into one stored page image per page. In production the engine is `pdfjs-dist`
 * (`getDocument(bytes).promise`) and the rasteriser renders each page onto a node canvas
 * (e.g. `@napi-rs/canvas`) and encodes PNG — both are **injected** so this package carries no
 * native/heavy dependency and is fully testable with fakes. `docx → pdf` needs an office converter
 * (LibreOffice / OnlyOffice) and is intentionally not handled here.
 */

/** The slice of a pdfjs page the renderer needs (kept minimal — pdfjs stays a runtime detail). */
export interface PdfPage {
  readonly pageNumber: number;
}

export interface PdfDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

/** A PDF engine — `pdfjs.getDocument(data).promise` in production. */
export interface PdfEngine {
  getDocument(data: Uint8Array): Promise<PdfDocument>;
}

/** Rasterise one page to PNG bytes — pdfjs `page.render({ canvasContext, viewport })` in production. */
export type PageRasterizer = (page: PdfPage) => Promise<Uint8Array>;

export interface PdfjsRendererDeps {
  /** Loads the source PDF bytes and stores the produced page images. */
  readonly blobs: BlobStore;
  readonly engine: PdfEngine;
  readonly rasterize: PageRasterizer;
}

export class PdfjsDocumentRenderer implements DocumentRenderer {
  constructor(private readonly deps: PdfjsRendererDeps) {}

  async pdfToPageImages(pdf: BinaryRef): Promise<readonly BinaryRef[]> {
    const bytes = await this.deps.blobs.get(pdf);
    const doc = await this.deps.engine.getDocument(bytes);
    const images: BinaryRef[] = [];
    // Render sequentially — page rasterisation is memory-heavy; one page at a time.
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const png = await this.deps.rasterize(page);
      images.push(await this.deps.blobs.put(png, "image/png"));
    }
    return images;
  }

  async docxToPdf(_docx: BinaryRef): Promise<BinaryRef> {
    throw new NotImplementedError(
      "PdfjsDocumentRenderer.docxToPdf — needs an office converter (LibreOffice/OnlyOffice)",
      "later",
    );
  }
}
