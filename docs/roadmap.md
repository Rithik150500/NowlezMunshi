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
      cross-reference against tracked cases; exposed over HTTP (`POST /search/party`,
      `POST /search/case-number`, `GET /cause-list`) and surfaced in the web app.
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
- [x] Ingestion **runner** — `IngestionPipeline.ingest` (uploaded Files) and `ingestOrder` (court
      Order PDFs): normalise → classify → write `summary` + page images (and `documentType` for files)
      back onto the artifact, wired at `POST /files/:id/ingest` and `POST /cases/:cnr/ingest`, and
      triggered automatically after upload / add-case; summaries then flow into the Munshi's
      [context](munshi.md#context-assembly). Runs on fakes today; the real rasteriser / Gemma endpoint
      switch on by config. Page-image **resolution** remains.

## Phase 4 — Munshi (real)

- [x] [Context assembly](munshi.md#context-assembly) from mini-details + instructions —
      `Munshi.assembleContext` + `toMiniDetail`, with default instructions; the CLI and HTTP API
      feed it the user's **real** caseload via `CaseManagement.listMiniDetails()`.
- [x] The **larger Gemma 4** tool-calling loop — `Munshi.run` is a multi-turn loop via the
      [`ModelClient`](decisions/0009-model-client-port.md) with a handler registry
      (`ask_user_question` short-circuits). Handlers: `full_case_details`, `web_search`
      (Tavily, [ADR-0010](decisions/0010-web-search-port.md)), `write_docx` + `read_docx`
      (compile/store/read a `.docx` via the [`BlobStore`](decisions/0014-blob-store-port.md)), and
      `read` (a `.docx` File's real text; summary + a note for page-image content pending the
      renderer) all wired. `run` returns the **tool-call trace** the front-ends display.
- [x] Tools: read, web search (Tavily), read docx, write docx, ask-user-question,
      full case details — defined (schemas + JSON Schema); execution lands with the loop.
- [x] [Inline-citation](munshi.md#citation-discipline) enforcement — structural validation
      (`MunshiResponseSchema`) **plus existence**: cited CNR / Order / File IDs **and their page
      numbers** are checked against the caseload (page counts ride in `CaseMiniDetail`); the model
      gets one correction prompt, and unverifiable citations are stripped.

## Phase 5 — Document handling

- [ ] Viewer — PDFs/images render **inline** and `.docx` shows a **text preview** (extracted via
      `GET /files/:id/text`) in the working-area pane, beside case details + order summaries. A
      **formatted** docx render (real PDF renderer, or browser Mammoth→HTML) remains.
- [ ] OnlyOffice editor + Create New document.
- [x] docx-js → docx → PDF-preview pipeline — `DocxPipeline` compiles docx-js in a sandbox
      ([ADR-0012](decisions/0012-docx-sandbox.md)) and renders a PDF preview via the renderer.
- [x] **write_docx → store → read_docx** round-trip — the compiled `.docx` is persisted in a
      [`BlobStore`](decisions/0014-blob-store-port.md) ([`@nowlez/storage`](../packages/storage))
      and attached as an AI-drafted [File](data-model.md#file); `read_docx` reads it back via
      Mammoth ([`@nowlez/document-handling`](../packages/document-handling)).
- [ ] URL web viewer.

## Phase 6 — Real eCourts source

- [ ] Real `CourtDataSource` — a **provisional `EcourtsMobileSource`**
      ([ADR-0016](decisions/0016-ecourts-mobile-source.md)) is built behind the port: **all six
      operations** mapped over an injectable transport + a request-param-codec seam, selectable via
      `NOWLEZ_COURT_SOURCE=ecourts-mobile` and reported by `GET /config`. **Remaining (externally
      gated):** the real param codec + confirmed wire shapes (a dynamic **MITM capture** — see the
      [runbook](runbooks/ecourts-mitm-and-codec.md)), **legal/compliance sign-off**, and the
      web-portal fallback (`ecourts-web`, still a stub).
- [x] Rate-limiting & caching at the seam — `CachingCourtDataSource` (the **fetch-once / fan-out**
      window) + `RateLimitedCourtDataSource`, wired into `selectCourtDataSourceFromEnv` via
      `NOWLEZ_COURT_CACHE_TTL_MS` / `NOWLEZ_COURT_MIN_INTERVAL_MS` (off by default). Multi-tenant
      fan-out semantics await the auth/tenancy model.
- [x] Daily refresh + alert engine — the diff engine ([`@nowlez/tracking`](../packages/tracking))
      plus alert **persistence + delivery**: alerts are stored via an
      [`AlertStore`](decisions/0015-alert-store-and-delivery.md), served as a feed (`GET /alerts`,
      mark-read) the web renders, and pushed best-effort over WhatsApp. The cycle (`runRefreshCycle`)
      runs on demand (`POST /refresh`) or on a timer via an opt-in **scheduler**
      (`NOWLEZ_REFRESH_INTERVAL_MS`; external cron can call it too). **Fetch-once / fan-out**
      (multi-tenant) and time-of-day/staggering policy remain.
- [x] Cause-list cross-referencing — implemented in
      [Case Management](../packages/case-management) (against the mock).
- [ ] Keep web-portal / commercial fallbacks swappable via the single selector.

## Phase 7 — Front-ends

- [x] A **CLI** entrypoint ([`@nowlez/cli`](../apps/cli)) — add/list cases, cause-list, refresh
      (alerts), and ask the Munshi; cases persist via the file repository.
- [x] An **HTTP API** ([`@nowlez/server`](../apps/server), Hono —
      [ADR-0011](decisions/0011-http-api-hono.md)) exposing the engine for the front-ends.
- [x] [Web app](interfaces.md#web-application) — a three-pane Vite + React shell
      ([`@nowlez/web`](../apps/web)) over the HTTP API: case list, add-case (by CNR or by
      **searching** party / case number), an **alerts feed** (mark-read), a daily **cause list**,
      and Munshi chat with **cited replies**. Selecting a case shows its **details, orders, and
      files** with a **track/untrack** toggle and an **expandable orders/files tree** in the left
      pane — files **download** or **preview** (PDF/image inline, `.docx` as text), the user can
      **upload** or **Create document** (seeds a Munshi draft), and the Munshi chat shows its **live
      tool-call trace** + cited replies.
- [ ] [Mobile app](interfaces.md#mobile-application) (CASES / MUNSHI).
- [x] [WhatsApp](interfaces.md#whatsapp) channel — a `WhatsAppClient` port + Meta adapter
      ([`@nowlez/whatsapp`](../packages/whatsapp), [ADR-0013](decisions/0013-whatsapp-channel.md));
      the inbound webhook routes a **command set** (`case`/`orders`/`cause-list`/`help`, a bare CNR)
      with anything else → Munshi. PDF/media delivery (order + cause-list PDFs) needs the Meta media
      API and remains.

---

> Phases 3+ are sketched at lower resolution on purpose; they will be refined as earlier
> phases land and the [open questions](open-questions.md) are answered.
