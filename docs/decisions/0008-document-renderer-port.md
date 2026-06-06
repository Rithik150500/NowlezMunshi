# ADR-0008 — Document rendering behind a DocumentRenderer port

**Status:** Accepted (Phase 2)

## Context

[Ingestion step 1](../file-management.md#step-1--normalisation-everything-becomes-page-images)
turns every document into **page images**, and the
[docx pipeline](0005-onlyoffice-and-docx-js.md) renders a `.docx` to a **PDF preview**. Both
need a rasteriser. Real PDF→image rasterisation in Node requires a heavyweight stack (a PDF
parser plus a canvas backend or a system binary), and the renderer choice was open
([open questions](../open-questions.md#document-handling)).

Crucially, **no real document bytes flow yet**: the mock source emits reference URIs
(`mock://…`), and real PDFs only arrive with the real eCourts source (Phase 6) and are only
consumed by the ingestion model (Phase 3).

## Decision

All rendering goes through a single **`DocumentRenderer` port** (in
[`@nowlez/contracts`](../../packages/contracts/src/rendering.ts)): `pdfToPageImages` and
`docxToPdf`. Adapters live in [`@nowlez/rendering`](../../packages/rendering):

- **`FakeDocumentRenderer`** — the default; deterministic and dependency-free. It derives
  stable references without rasterising, and is wired into `IngestionPipeline.normalize` so
  the format → page-images flow runs end to end and is **tested today**.
- **`PdfjsDocumentRenderer`** — the real renderer: it loads the source PDF from a `BlobStore`,
  drives an **injected `PdfEngine`** (pdfjs-dist's `getDocument(bytes).promise`) to get the pages,
  rasterises each via an **injected `PageRasterizer`** (a node canvas, e.g. `@napi-rs/canvas`), and
  stores one PNG per page back in the `BlobStore`. The engine + rasteriser are injected so this
  package keeps **no native/heavy dependency** and the orchestration is **fully tested with fakes**.
- **`selectDocumentRenderer(kind)`** — the single selector; `"pdfjs"` can't be built from a kind
  alone (it needs blob store + engine + rasteriser), so construct `PdfjsDocumentRenderer` directly.

`docx → pdf` is **not** handled by the PDF renderer (pdfjs only reads PDFs) — it needs an office
converter (LibreOffice/OnlyOffice) and stays deferred.

**Production wiring** (a thin runtime adapter, outside this package, since pdfjs-dist + canvas are
the only native pieces):

```ts
import * as pdfjs from "pdfjs-dist";
import { createCanvas } from "@napi-rs/canvas";
const engine = { getDocument: async (data) => (await pdfjs.getDocument({ data }).promise) };
const rasterize = async (page) => {
  const vp = page.getViewport({ scale: 2 });
  const canvas = createCanvas(vp.width, vp.height);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas.toBuffer("image/png");
};
new PdfjsDocumentRenderer({ blobs, engine, rasterize });
```

## Consequences

- The normalisation **seam and orchestration are real and tested now**, with no
  heavyweight/native deps and a fast, green CI — including `PdfjsDocumentRenderer`'s page loop.
- The only un-CI-able pieces are the injected **pdfjs-dist engine + canvas rasteriser** (native,
  runtime) and the page-image **resolution/format** — wired by the thin production adapter above.
- Same swap-behind-one-selector discipline as [ADR-0002](0002-source-agnostic-court-data-interface.md)
  / [ADR-0007](0007-persistence-port.md).

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Port + fake adapter (real lib named) | **Chosen** | Real, tested seam now; heavy bit added where it's used. |
| Add `pdfjs-dist` + native canvas now | Deferred | Heavier install, slower tests, and nothing consumes the images until real bytes flow. |
| Shell out to poppler / ghostscript / ImageMagick | Rejected | System binaries not present in CI by default. |

## Related

- [ADR-0005](0005-onlyoffice-and-docx-js.md), [`../file-management.md`](../file-management.md),
  [`../document-handling.md`](../document-handling.md)
- [open questions](../open-questions.md#document-handling)
