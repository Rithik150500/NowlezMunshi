# Architecture Decision Records (ADRs)

This directory records the **load-bearing, hard-to-reverse decisions** behind NowLez, each
with its context, the decision itself, and its consequences. The aim is that a future
contributor can understand **why** the system is the way it is — and can supersede a
decision deliberately (with a new ADR) rather than quietly contradicting it.

## Format

Each ADR uses a lightweight structure: **Status · Context · Decision · Consequences** (and
**Alternatives considered** / **Risks** where relevant).

## Index

| # | Title | Status |
| --- | --- | --- |
| [0001](0001-cnr-as-sole-primary-key.md) | CNR is the sole primary key of a Case | Accepted |
| [0002](0002-source-agnostic-court-data-interface.md) | A single source-agnostic court-data interface | Accepted |
| [0003](0003-two-model-split.md) | Two Gemma 4 models, split by job | Accepted (+ [research update](../research/2026-06-05-ecourts-gemma-landscape.md)) |
| [0004](0004-extract-from-ecourts-mobile-app.md) | Extract court data from the eCourts mobile-app backend | Accepted — **premise validated** by [APK teardown](../research/2026-06-05-ecourts-apk-teardown.md) |
| [0005](0005-onlyoffice-and-docx-js.md) | OnlyOffice editor + docx-js → PDF-preview pipeline | Accepted |
| [0006](0006-typescript-monorepo-stack.md) | TypeScript monorepo (pnpm) as the stack | Accepted (Phase 1) |
| [0007](0007-persistence-port.md) | Persistence behind a CaseRepository port (engine deferred) | Accepted (Phase 2) |
| [0008](0008-document-renderer-port.md) | Document rendering behind a DocumentRenderer port | Accepted (Phase 2) |
| [0009](0009-model-client-port.md) | Reach the Gemma models through a ModelClient port | Accepted (Phase 3 / 4) |
| [0010](0010-web-search-port.md) | Web search behind a WebSearch port (Tavily) | Accepted (Phase 4) |
| [0011](0011-http-api-hono.md) | HTTP API with Hono | Accepted (Phase 7) |
| [0012](0012-docx-sandbox.md) | Executing docx-js in a sandbox (write_docx) | Accepted (Phase 5) |
| [0013](0013-whatsapp-channel.md) | WhatsApp channel (Meta Cloud API) | Accepted (Phase 7) |
| [0014](0014-blob-store-port.md) | Object storage behind a BlobStore port | Accepted (Phase 6) |
| [0015](0015-alert-store-and-delivery.md) | Alert persistence behind an AlertStore port (+ delivery) | Accepted (Phase 6) |
| [0016](0016-ecourts-mobile-source.md) | eCourts mobile-app CourtDataSource (provisional adapter) | Accepted (Phase 6, provisional) |

> "Accepted" here means **agreed in the specification** (or, for ADRs from 0006 onward,
> **decided during the build phase noted**). Implementation may surface details that refine
> these (tracked in [`../open-questions.md`](../open-questions.md)); material reversals
> should be a new, superseding ADR.

## Adding an ADR

1. Copy the structure of an existing ADR.
2. Number it sequentially.
3. Add a row to the index above.
4. If it supersedes an earlier one, set the old ADR's status to **Superseded by ADR-XXXX**
   and link both ways.
