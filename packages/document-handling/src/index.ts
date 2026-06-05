import type { BinaryRef, DocumentRenderer, DocxCompiler } from "@nowlez/contracts";
import { selectDocumentRenderer } from "@nowlez/rendering";
import { NodeVmDocxSandbox } from "./sandbox";

export { type DocxSandboxOptions, NodeVmDocxSandbox } from "./sandbox";

/** The three kinds of content the viewer handles, for both Orders and Files. */
export type ViewerContentType = "pdf" | "docx" | "image";
export const VIEWER_CONTENT_TYPES: readonly ViewerContentType[] = ["pdf", "docx", "image"];

/**
 * The docx generation pipeline (docs/document-handling.md, ADR-0005): docx-js code
 * -> `.docx` (compiled by executing the code in a sandbox — ADR-0012) -> PDF
 * preview (the same docx-to-preview rendering the ingestion pipeline uses).
 */
export class DocxPipeline {
  constructor(
    private readonly sandbox: DocxCompiler = new NodeVmDocxSandbox(),
    private readonly renderer: DocumentRenderer = selectDocumentRenderer(),
  ) {}

  /** Compile docx-js code into a `.docx` (executes the code in a sandbox — ADR-0012). */
  compile(docxJsCode: string): Promise<Uint8Array> {
    return this.sandbox.compile(docxJsCode);
  }

  /** Render a `.docx` to a PDF preview, for display and for feeding back to the Munshi. */
  renderPdfPreview(docx: BinaryRef): Promise<BinaryRef> {
    return this.renderer.docxToPdf(docx);
  }
}
