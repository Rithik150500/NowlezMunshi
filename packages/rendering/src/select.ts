import type { DocumentRenderer } from "@nowlez/contracts";
import { FakeDocumentRenderer } from "./fake";

export type RendererKind = "fake" | "pdfjs";

/**
 * Select a DocumentRenderer (ADR-0008). The deterministic fake is the default. The real renderer
 * is `PdfjsDocumentRenderer`, which can't be built from a kind alone — it needs a blob store, a PDF
 * engine (pdfjs-dist), and a page rasteriser (canvas) — so construct it directly with those deps.
 */
export function selectDocumentRenderer(kind: RendererKind = "fake"): DocumentRenderer {
  switch (kind) {
    case "fake":
      return new FakeDocumentRenderer();
    case "pdfjs":
      throw new Error(
        "Construct PdfjsDocumentRenderer({ blobs, engine, rasterize }) directly — the real renderer needs injected pdfjs-dist + canvas.",
      );
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled renderer kind: ${String(x)}`);
}
