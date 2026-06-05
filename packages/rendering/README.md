# @nowlez/rendering

`DocumentRenderer` adapters ([ADR-0008](../../docs/decisions/0008-document-renderer-port.md)).
The [`DocumentRenderer`](../contracts/src/rendering.ts) port turns PDFs into page
images (for the ingestion vision model) and Word documents into a PDF preview (the
shared docx-to-preview path).

| Adapter | Use |
| --- | --- |
| `FakeDocumentRenderer` | Default; deterministic, dependency-free. Derives stable references without rasterising — enough to exercise the pipelines end to end. |
| `selectDocumentRenderer(kind)` | The single selector. `"pdfjs"` (the real rasteriser) is deferred. |

The real implementation is **pdfjs-dist** (PDF parsing) + a **prebuilt canvas**
backend (e.g. `@napi-rs/canvas`, no compile step). It lands when real document
bytes actually flow — there are none until the real eCourts source (Phase 6) and
the ingestion model (Phase 3) — so until then the fake keeps the seam exercised.
See ADR-0008.
