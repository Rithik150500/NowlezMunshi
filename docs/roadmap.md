# Roadmap

A phased plan from "specification on paper" to "working product". Phases are ordered by
dependency, not by calendar. The stack was decided at the start of Phase 1 — a
**TypeScript monorepo** ([ADR-0006](decisions/0006-typescript-monorepo-stack.md)).

## Phase 0 — Foundation _(in progress)_

**Goal:** a navigable, faithful source of truth.

- [x] Capture the specification as structured docs (this `docs/` set).
- [x] Record the load-bearing decisions as [ADRs](decisions/).
- [x] Collect everything the spec leaves undecided in [open questions](open-questions.md).
- [ ] Review & sign-off of the docs with the product owner.

**Exit criteria:** the docs are agreed as the shared reference everyone builds against.

## Phase 1 — Scaffold _(complete)_

**Goal:** a project skeleton future sessions can fill in.

- [x] **Decide the stack** — TypeScript monorepo, pnpm ([ADR-0006](decisions/0006-typescript-monorepo-stack.md)).
- [x] Repository structure for the four layers (`packages/`) + the front-ends (`apps/`, placeholders).
- [x] Define the **`CourtDataSource` interface** ([ADR-0002](decisions/0002-source-agnostic-court-data-interface.md))
      with a **`MockCourtDataSource`** and a single source selector — no real eCourts calls yet.
- [x] Stub modules for Case Management, File Management, Munshi, Document Handling.
- [x] The **[design contracts](contracts.md)** as a shared `@nowlez/contracts` package
      (data model, `CourtDataSource`, Munshi tool schemas, ingestion schema).
- [x] Project tooling: pnpm workspaces, Biome (lint/format), Vitest (tests), `tsc` (typecheck), GitHub Actions CI.
- [x] A [SessionStart hook](https://code.claude.com/docs/en/claude-code-on-the-web) (`.claude/`) so
      web sessions auto-install dependencies.

**Exit criteria:** the project **builds, lints, and runs the test suite green** — met
(`pnpm run check`: Biome + `tsc` + Vitest).

## Phase 2 — MVP slice (add-case-by-CNR, end to end) _(in progress)_

**Goal:** one thin vertical slice proving the architecture.

- [x] Add a case **by CNR** (and by QR) through the `CourtDataSource` — in
      [`@nowlez/case-management`](../packages/case-management) against the mock source.
- [x] Persist a [Case](data-model.md#case) (CNR as sole PK) with its [Orders](data-model.md#order)
      — through a `CaseRepository` port (in-memory + durable file adapters; engine deferred,
      [ADR-0007](decisions/0007-persistence-port.md)).
- [x] Normalise an order PDF to **page images** (ingestion step 1) — wired through a
      `DocumentRenderer` port with a fake; the real rasteriser is deferred
      ([ADR-0008](decisions/0008-document-renderer-port.md)) until real bytes flow.
- [x] Case Management **read paths** — search (by party / case number) and the cause-list
      cross-reference against tracked cases.
- [ ] A minimal **viewer** to read it back (UI — lands with [document handling](#phase-5--document-handling)).
- [x] Tests covering the slice (against the mock).

**Exit criteria:** a user can add a case by CNR and view its orders, against stubbed data.

## Phase 3 — Ingestion pipeline (real)

- [ ] Normalisation for all formats (PDF / doc/docx / image → page images).
- [ ] Wire the **smaller Gemma 4** model for classification + summarisation.
- [ ] Populate document type, summaries, and Case [Mini-Details](data-model.md#case-mini-detail--summary).

## Phase 4 — Munshi (real)

- [x] [Context assembly](munshi.md#context-assembly) from mini-details + instructions —
      `Munshi.assembleContext` + `toMiniDetail`, with default instructions.
- [ ] The **larger Gemma 4** tool-calling loop.
- [x] Tools: read, web search (Tavily), read docx, write docx, ask-user-question,
      full case details — defined (schemas + JSON Schema); execution lands with the loop.
- [ ] [Inline-citation](munshi.md#citation-discipline) enforcement.

## Phase 5 — Document handling

- [ ] Viewer (PDF / doc/docx / images).
- [ ] OnlyOffice editor + Create New document.
- [ ] docx-js → docx → PDF-preview pipeline.
- [ ] URL web viewer.

## Phase 6 — Real eCourts source

- [ ] Implement the mobile-app-backend `CourtDataSource`
      ([ADR-0004](decisions/0004-extract-from-ecourts-mobile-app.md)).
- [ ] Rate-limiting, caching, **fetch-once / fan-out** ([alerts & tracking](alerts-and-tracking.md)).
- [ ] Daily refresh + alert engine — the diff/classification engine is **implemented**
      ([`@nowlez/tracking`](../packages/tracking), against the mock); **scheduling**,
      **fetch-once/fan-out**, and **delivery channels** remain.
- [x] Cause-list cross-referencing — implemented in
      [Case Management](../packages/case-management) (against the mock).
- [ ] Keep web-portal / commercial fallbacks swappable via the single selector.

## Phase 7 — Front-ends

- [ ] [Web app](interfaces.md#web-application) (three-pane).
- [ ] [Mobile app](interfaces.md#mobile-application) (CASES / MUNSHI).
- [ ] [WhatsApp](interfaces.md#whatsapp) channel.

---

> Phases 3+ are sketched at lower resolution on purpose; they will be refined as earlier
> phases land and the [open questions](open-questions.md) are answered.
