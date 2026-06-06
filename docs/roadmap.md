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

- [x] Normalisation for all formats (PDF / doc/docx / image → page images) — via the
      `DocumentRenderer` port ([ADR-0008](decisions/0008-document-renderer-port.md)); real
      rasteriser deferred until real bytes flow.
- [x] Wire the **smaller Gemma 4** model for classification + summarisation — via the
      `ModelClient` port ([ADR-0009](decisions/0009-model-client-port.md)); env-driven real
      endpoint, fake for tests.
- [x] Ingestion **runner** for uploaded Files — `IngestionPipeline.ingest` (normalise → classify →
      write `documentType`/`summary`/page images back onto the File), wired at `POST /files/:id/ingest`
      and run automatically after upload; its summary then flows into the Munshi's
      [context](munshi.md#context-assembly). Runs on fakes today; the real rasteriser / Gemma endpoint
      switch on by config. Running the runner over **Orders** (court PDFs) and page-image
      **resolution** remain.

## Phase 4 — Munshi (real)

- [x] [Context assembly](munshi.md#context-assembly) from mini-details + instructions —
      `Munshi.assembleContext` + `toMiniDetail`, with default instructions; the CLI and HTTP API
      feed it the user's **real** caseload via `CaseManagement.listMiniDetails()`.
- [x] The **larger Gemma 4** tool-calling loop — `Munshi.run` is a multi-turn loop via the
      [`ModelClient`](decisions/0009-model-client-port.md) with a handler registry
      (`ask_user_question` short-circuits). Handlers: `full_case_details`, `web_search`
      (Tavily, [ADR-0010](decisions/0010-web-search-port.md)), `write_docx` + `read_docx`
      (compile/store/read a `.docx` via the [`BlobStore`](decisions/0014-blob-store-port.md))
      wired; `read` (real page bytes, Phase 6) reports unavailable until its deps arrive.
- [x] Tools: read, web search (Tavily), read docx, write docx, ask-user-question,
      full case details — defined (schemas + JSON Schema); execution lands with the loop.
- [x] [Inline-citation](munshi.md#citation-discipline) enforcement — structural validation
      (`MunshiResponseSchema`) **plus existence**: cited CNR / Order / File IDs are checked against
      the caseload, the model gets one correction prompt, and unverifiable citations are stripped.
      Page-range validation (needs page counts in context) is the remaining piece.

## Phase 5 — Document handling

- [ ] Viewer (PDF / doc/docx / images) — in-browser rendering. (Stored Files are already
      **downloadable** via `GET /files/:id` and the web app; in-app viewing is the remaining piece.)
- [ ] OnlyOffice editor + Create New document.
- [x] docx-js → docx → PDF-preview pipeline — `DocxPipeline` compiles docx-js in a sandbox
      ([ADR-0012](decisions/0012-docx-sandbox.md)) and renders a PDF preview via the renderer.
- [x] **write_docx → store → read_docx** round-trip — the compiled `.docx` is persisted in a
      [`BlobStore`](decisions/0014-blob-store-port.md) ([`@nowlez/storage`](../packages/storage))
      and attached as an AI-drafted [File](data-model.md#file); `read_docx` reads it back via
      Mammoth ([`@nowlez/document-handling`](../packages/document-handling)).
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

- [x] A **CLI** entrypoint ([`@nowlez/cli`](../apps/cli)) — add/list cases, cause-list, refresh
      (alerts), and ask the Munshi; cases persist via the file repository.
- [x] An **HTTP API** ([`@nowlez/server`](../apps/server), Hono —
      [ADR-0011](decisions/0011-http-api-hono.md)) exposing the engine for the front-ends.
- [x] [Web app](interfaces.md#web-application) — a three-pane Vite + React shell
      ([`@nowlez/web`](../apps/web)) over the HTTP API (case list, add-case, refresh, Munshi chat);
      selecting a case shows its files — each **downloadable** (`GET /files/:id`) and the user can
      **upload** documents (`POST /cases/:cnr/files`) — so AI-drafted and uploaded files flow
      end-to-end.
- [ ] [Mobile app](interfaces.md#mobile-application) (CASES / MUNSHI).
- [x] [WhatsApp](interfaces.md#whatsapp) channel — a `WhatsAppClient` port + Meta adapter
      ([`@nowlez/whatsapp`](../packages/whatsapp), [ADR-0013](decisions/0013-whatsapp-channel.md));
      the inbound webhook (HTTP API) routes a text → Munshi → reply.

---

> Phases 3+ are sketched at lower resolution on purpose; they will be refined as earlier
> phases land and the [open questions](open-questions.md) are answered.
