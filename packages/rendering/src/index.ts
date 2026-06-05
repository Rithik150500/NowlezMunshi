/**
 * @nowlez/rendering — DocumentRenderer adapters (ADR-0008). A deterministic fake
 * backs dev and tests today; the real pdfjs-dist + canvas rasteriser slots in
 * behind the same port when real document bytes flow.
 */
export { FakeDocumentRenderer } from "./fake";
export { type RendererKind, selectDocumentRenderer } from "./select";
