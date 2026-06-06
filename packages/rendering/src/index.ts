/**
 * @nowlez/rendering — DocumentRenderer adapters (ADR-0008). A deterministic fake
 * backs dev and tests; the real `PdfjsDocumentRenderer` drives an injected PDF
 * engine (pdfjs-dist) + page rasteriser (canvas) behind the same port.
 */
export { FakeDocumentRenderer } from "./fake";
export {
  type PageRasterizer,
  type PdfDocument,
  type PdfEngine,
  PdfjsDocumentRenderer,
  type PdfjsRendererDeps,
  type PdfPage,
} from "./pdfjs";
export { type RendererKind, selectDocumentRenderer } from "./select";
