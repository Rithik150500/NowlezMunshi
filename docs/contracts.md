# Design Contracts

This page is the narrative companion to the code in
[`packages/contracts`](../packages/contracts) (`@nowlez/contracts`) — the concrete,
type-checked expression of this specification. Where the prose docs describe *what*
NowLez does, the contracts pin down the *shapes* every package agrees on: the data
model, the source-agnostic court-data seam, the Munshi's toolset, and the ingestion
schema.

> **Faithful, not invented.** Where the spec is silent (exact CNR format, eCourts request
> shapes, persistence, prompt wording), the types are intentionally loose and the gap is
> flagged inline and in [`open-questions.md`](open-questions.md). The contracts add
> *structure*, not *decisions* the spec didn't make.

## Why contracts come first

The stack ([ADR-0006](decisions/0006-typescript-monorepo-stack.md)) is a TypeScript
monorepo, so the contracts are a real package the whole repo imports. Settling them before
behaviour means the [four layers](architecture.md) and the front-ends share one
compile-time source of truth, and the [MVP slice](roadmap.md#phase-2--mvp-slice-add-case-by-cnr-end-to-end)
has something solid to build against.

## The data model

[`data-model.ts`](../packages/contracts/src/data-model.ts) encodes
[the entities](data-model.md): `Case` (keyed solely by its `Cnr` —
[ADR-0001](decisions/0001-cnr-as-sole-primary-key.md)), `Order`, `FileDocument` (the
domain "File", renamed to avoid the global `File`), `CaseMiniDetail`, `User`, `Alert`,
`Client` (the advocate's local client, linked to a case by an optional `clientId` —
[ADR-0017](decisions/0017-clients-local-entity.md)), and `Deadline` (a local limitation / filing
due date — [ADR-0018](decisions/0018-deadlines-and-limitation.md)).
Identifiers are **branded** ([`brands.ts`](../packages/contracts/src/brands.ts)) so a CNR
can't be confused with an arbitrary string or an Order/File ID. Stored bytes are referred
to through an opaque [`BinaryRef`](../packages/contracts/src/binary.ts); the bytes themselves
live in a [`BlobStore`](#infrastructure-ports) ([ADR-0014](decisions/0014-blob-store-port.md)),
not inlined in the case record.

## The source-agnostic court-data interface

[`court-data-source.ts`](../packages/contracts/src/court-data-source.ts) is the single seam
([ADR-0002](decisions/0002-source-agnostic-court-data-interface.md)) through which all court
data enters NowLez. It encodes the operations [Case Management](case-management.md) implies —
`getCaseByCnr`, `getCaseByQr`, `getOrders`, `searchByParty`, `searchByCaseNumber`,
`getCauseList` — over DTOs for the court-hierarchy scope and search queries. A `SourceId`
names which implementation is in use; [`@nowlez/court-data`](../packages/court-data) provides
the `MockCourtDataSource` and the single `selectCourtDataSource()` selector.

> The exact method signatures and request/response shapes are **provisional** — an
> [open question](open-questions.md#ecourts-integration) to settle when a real source is
> built in Phase 6.

## The Munshi's toolset

[`munshi-tools.ts`](../packages/contracts/src/munshi-tools.ts) defines the
[six tools](munshi.md#the-toolset) as [zod](https://zod.dev) input schemas — `read`,
`web_search`, `read_docx`, `write_docx`, `ask_user_question`, `full_case_details` — and
derives a JSON Schema for each (`z.toJSONSchema`) for the LLM tool-calling API. It also
types the [context package](munshi.md#context-assembly) (mini-details + the three
instruction slots) and the cited `MunshiResponse`. Citations themselves are a discriminated
union in [`citations.ts`](../packages/contracts/src/citations.ts): a CNR, an Order ID +
page, a File ID + page, or a URL ([citation discipline](munshi.md#citation-discipline)).
`citations.ts` also provides the **existence check** the Munshi enforces — `isKnownCitation`
/ `unknownCitations` against a `CitationAuthority` (the caseload's CNRs, and each Order/File id with
its page count, so a cited page is checked too).

## The ingestion schema

[`ingestion.ts`](../packages/contracts/src/ingestion.ts) captures the
[pipeline](file-management.md): the per-format `NORMALIZATION_PATHS` (every format becomes
page images), the classification *request* (page images + case mini-details as context),
and the classification *result* (CNR + document type + summary), with a zod schema to
validate what the smaller Gemma model returns.

## Infrastructure ports

Eleven more ports keep the engine decoupled from infrastructure, each with adapters that keep
the build green without heavyweight dependencies or secrets:

- **`CaseRepository`** ([`persistence.ts`](../packages/contracts/src/persistence.ts),
  [ADR-0007](decisions/0007-persistence-port.md)) — how cases are stored. Adapters in
  [`@nowlez/persistence`](../packages/persistence): an in-memory store (default) and a durable
  file-backed store; the production engine (SQLite) is deferred behind the port.
- **`AlertStore`** ([`alert-store.ts`](../packages/contracts/src/alert-store.ts),
  [ADR-0015](decisions/0015-alert-store-and-delivery.md)) — persists the tracking engine's Alerts
  (idempotent by id) for the feed. Adapters in [`@nowlez/persistence`](../packages/persistence):
  in-memory (default) + file-backed. Wired into `POST /refresh` (persist), `GET /alerts`,
  `POST /alerts/:id/read`.
- **`ClientRepository`** ([`client.ts`](../packages/contracts/src/client.ts),
  [ADR-0017](decisions/0017-clients-local-entity.md)) — stores the advocate's clients (a NowLez-local
  entity). Adapters in [`@nowlez/persistence`](../packages/persistence): in-memory (default) +
  file-backed. Used by `ClientService`; a case links to a client via an optional `clientId`.
- **`DeadlineStore`** ([`deadline.ts`](../packages/contracts/src/deadline.ts),
  [ADR-0018](decisions/0018-deadlines-and-limitation.md)) — stores a case's deadlines (limitation /
  filing due dates). Adapters in [`@nowlez/persistence`](../packages/persistence): in-memory
  (default) + file-backed. Used by `DeadlineService`; due dates may be computed by the limitation
  calculator in [`@nowlez/tracking`](../packages/tracking).
- **`BlobStore`** ([`storage.ts`](../packages/contracts/src/storage.ts),
  [ADR-0014](decisions/0014-blob-store-port.md)) — object storage for the bytes a `BinaryRef`
  points at (e.g. a drafted `.docx`). Adapters in [`@nowlez/storage`](../packages/storage): an
  in-memory store (default) and a durable filesystem store; a cloud store (S3/GCS) is deferred
  behind the port. Wired into `write_docx` (store) and `read_docx` (fetch).
- **`DocumentRenderer`** ([`rendering.ts`](../packages/contracts/src/rendering.ts),
  [ADR-0008](decisions/0008-document-renderer-port.md)) — PDFs → page images, and docx → PDF
  preview. Adapters in [`@nowlez/rendering`](../packages/rendering): a deterministic fake
  drives the pipelines today; the real pdfjs + canvas rasteriser lands when real bytes flow.
- **`ModelClient`** ([`model.ts`](../packages/contracts/src/model.ts),
  [ADR-0009](decisions/0009-model-client-port.md)) — reaches the two Gemma models (callers ask
  for `"small"` / `"large"`). Adapters in [`@nowlez/model`](../packages/model): a deterministic
  fake for tests, and an env-driven OpenAI-compatible client for real endpoints. Wired into
  ingestion `classify` (small) and the Munshi `run` (large).
- **`WebSearch`** ([`web-search.ts`](../packages/contracts/src/web-search.ts),
  [ADR-0010](decisions/0010-web-search-port.md)) — the Munshi's `web_search` tool. Adapters in
  [`@nowlez/web-search`](../packages/web-search): a fake for tests, and an env-driven **Tavily**
  client. Wired via `munshiHandlers({ webSearch })`.
- **`DocxCompiler`** ([`docx.ts`](../packages/contracts/src/docx.ts),
  [ADR-0012](decisions/0012-docx-sandbox.md)) — compiles model-emitted docx-js into a `.docx`
  by **executing it in a sandbox** (`@nowlez/document-handling`'s `NodeVmDocxSandbox`; a real
  isolate is needed for untrusted input in production). Wired as the Munshi's `write_docx` handler.
- **`DocxReader`** ([`docx.ts`](../packages/contracts/src/docx.ts),
  [ADR-0014](decisions/0014-blob-store-port.md)) — extracts the **text** from a `.docx` (the
  Munshi's `read_docx`). Adapter in [`@nowlez/document-handling`](../packages/document-handling):
  a **Mammoth**-backed reader, closing the write → store → read round-trip.
- **`WhatsAppClient`** ([`whatsapp.ts`](../packages/contracts/src/whatsapp.ts),
  [ADR-0013](decisions/0013-whatsapp-channel.md)) — sends WhatsApp messages. Adapters in
  [`@nowlez/whatsapp`](../packages/whatsapp): a fake and an env-driven Meta Cloud API client; the
  inbound webhook is served by the [HTTP API](../apps/server).

## Validation at the boundaries

zod schemas guard data that crosses a **trust boundary** — LLM tool inputs, the Munshi's
cited output, the ingestion result, and search queries entering the court-data seam — and
double as the source for the LLM tool JSON Schemas. Pure domain types (the data model) stay
as plain TypeScript interfaces.

## See also

- [`packages/contracts/README.md`](../packages/contracts/README.md) — the module-by-module map.
- [`architecture.md`](architecture.md) · [`data-model.md`](data-model.md) ·
  [`munshi.md`](munshi.md) · [`file-management.md`](file-management.md)
- [ADR-0006](decisions/0006-typescript-monorepo-stack.md) — the stack these contracts live in.
