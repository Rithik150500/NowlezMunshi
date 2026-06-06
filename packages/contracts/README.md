# @nowlez/contracts

The **design contracts** for NowLez: the shared, source-of-truth TypeScript types
and runtime schemas that every other package builds against. Nothing here makes
network calls or runs a model — it is pure shape.

These contracts are the concrete, type-checked expression of the
[`docs/`](../../docs/) specification. The narrative companion is
[`docs/contracts.md`](../../docs/contracts.md).

## What's inside

| Module | Contract | Spec |
| --- | --- | --- |
| `brands.ts` | Branded `Cnr` / `OrderId` / `FileId` / `UserId` ids + smart constructors | [ADR-0001](../../docs/decisions/0001-cnr-as-sole-primary-key.md) |
| `binary.ts` | `BinaryRef` — opaque reference to stored bytes (PDFs, page images) | [data-model](../../docs/data-model.md) |
| `data-model.ts` | `Case`, `Order`, `FileDocument`, `CaseMiniDetail`, `User`, `Alert` | [data-model](../../docs/data-model.md) |
| `citations.ts` | `Citation` union (CNR / Order+page / File+page / URL) + schema | [munshi#citation-discipline](../../docs/munshi.md#citation-discipline) |
| `court-data-source.ts` | The source-agnostic `CourtDataSource` interface + DTOs | [ADR-0002](../../docs/decisions/0002-source-agnostic-court-data-interface.md) |
| `ingestion.ts` | Normalisation paths + classification request/result schema | [file-management](../../docs/file-management.md) |
| `munshi-tools.ts` | The six tool input schemas (+ JSON Schema) + context package | [munshi#the-toolset](../../docs/munshi.md#the-toolset) |
| `errors.ts` | `NotImplementedError` (carries the roadmap phase) | [roadmap](../../docs/roadmap.md) |

## Conventions

- **Faithful, not invented.** Where the spec is silent (exact CNR format, eCourts
  request shapes, persistence), the type is intentionally loose and the gap is
  flagged in a comment pointing at [`open-questions.md`](../../docs/open-questions.md).
- **Schemas at the boundaries.** [zod](https://zod.dev) schemas validate data that
  crosses a trust boundary — LLM tool inputs/outputs, the ingestion result, search
  queries — and double as the source for the LLM tool JSON Schemas (`z.toJSONSchema`).
- **`import type`** for type-only imports (`verbatimModuleSyntax` is on).
