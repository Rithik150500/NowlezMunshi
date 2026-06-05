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
- **`selectDocumentRenderer(kind)`** — the single selector; `"pdfjs"` (the real rasteriser) is deferred.

The real implementation will be **pdfjs-dist** (PDF parsing) + a **prebuilt canvas** backend
(e.g. `@napi-rs/canvas` — prebuilt binaries, no compile step). It lands behind the same port
when real bytes flow (Phase 3/6).

## Consequences

- The normalisation **seam and orchestration are real and tested now**, with no
  heavyweight/native deps and a fast, green CI.
- Real rasterisation is added **exactly where it's first exercised** (when real PDFs exist and
  a model consumes the images), not speculatively.
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
