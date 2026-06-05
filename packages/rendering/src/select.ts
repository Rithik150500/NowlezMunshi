import { type DocumentRenderer, NotImplementedError } from "@nowlez/contracts";
import { FakeDocumentRenderer } from "./fake";

export type RendererKind = "fake" | "pdfjs";

/**
 * Select a DocumentRenderer (ADR-0008). The deterministic fake is the default
 * until real document bytes flow; the real pdfjs-dist + canvas rasteriser slots
 * in behind this same selector (Phase 3/6).
 */
export function selectDocumentRenderer(kind: RendererKind = "fake"): DocumentRenderer {
  switch (kind) {
    case "fake":
      return new FakeDocumentRenderer();
    case "pdfjs":
      throw new NotImplementedError("pdfjs DocumentRenderer", "Phase 3");
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled renderer kind: ${String(x)}`);
}
