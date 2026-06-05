# ADR-0007 — Persistence behind a CaseRepository port (engine deferred)

**Status:** Accepted (Phase 2)

## Context

Phase 2 needs to **persist a [Case](../data-model.md#case)** (keyed by CNR —
[ADR-0001](0001-cnr-as-sole-primary-key.md)) with its Orders. The concrete datastore
(relational vs. document) and object storage for PDFs/page images were left open
([open questions](../open-questions.md#data-model)). We don't want to lock the engine before
the query/scale needs are understood — but we *do* need durable persistence now, and the
test suite must stay green without external infrastructure.

## Decision

All case persistence goes through a single **`CaseRepository` port** (in
[`@nowlez/contracts`](../../packages/contracts/src/persistence.ts)). Adapters live in
[`@nowlez/persistence`](../../packages/persistence):

- **`InMemoryCaseRepository`** — the default; process-lifetime store for dev and tests.
- **`FileCaseRepository`** — durable, dependency-free JSON file store for the MVP.
- **`selectCaseRepository(kind, opts)`** — the single selector; swap stores by changing one argument.

The recommended **production engine is SQLite** (e.g. `better-sqlite3`), added behind the
same port when indexed queries / concurrency are needed. Bulk binary content (source PDFs,
page images) will live in **object storage** behind a future `BlobStore` port, referenced
from a [`BinaryRef`](../../packages/contracts/src/binary.ts) — not inlined in the case record.

## Consequences

- **Durable persistence today** (file-backed) with **zero new dependencies**; CI stays green and fast.
- The engine decision is **deferred without blocking** Phase 2 — the same seam discipline as
  the [`CourtDataSource`](0002-source-agnostic-court-data-interface.md).
- `CaseManagement` depends only on the **port**; the default is in-memory, so tests need no disk.
- Swapping to SQLite/Postgres is a new adapter + selector case — nothing ripples outward.

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Port + in-memory & file adapters | **Chosen** | Durable now, zero deps, engine deferred. |
| Commit to SQLite (`better-sqlite3`) now | Deferred | Native build adds CI friction; premature before scale needs are known. |
| Node built-in `node:sqlite` | Deferred | Still experimental on Node 22 (flag + warnings). |
| An ORM (Prisma/Drizzle) now | Rejected (for now) | Heavyweight for an MVP slice. |

## Related

- [ADR-0001](0001-cnr-as-sole-primary-key.md), [ADR-0002](0002-source-agnostic-court-data-interface.md)
- [`../data-model.md`](../data-model.md), [`../contracts.md`](../contracts.md),
  [open questions](../open-questions.md#data-model)
