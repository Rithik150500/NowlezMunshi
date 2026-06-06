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
      `DocumentRenderer` port ([ADR-0008](decisions/0008-document-renderer-port.md)). The real
      `PdfjsDocumentRenderer` (page loop over an injected pdfjs engine + canvas) is built and tested;
      the native pdfjs-dist + canvas are the only runtime pieces.
- [x] Case Management **read paths** — search (by party / case number) and the cause-list
      cross-reference against tracked cases; exposed over HTTP (`POST /search/party`,
      `POST /search/case-number`, `GET /cause-list`) and surfaced in the web app.
- [ ] A minimal **viewer** to read it back (UI — lands with [document handling](#phase-5--document-handling)).
- [x] **Clients** — the advocate's clients as a NowLez-local entity
      ([ADR-0017](decisions/0017-clients-local-entity.md), [clients.md](clients.md)): a
      `ClientRepository` port + a `ClientService` (CRUD + case assignment + a client-facing
      [update](clients.md#client-updates)); a case links to a client via an optional `clientId`,
      so the CNR stays the sole key.
- [x] **Deadlines & limitation** — deadlines as a NowLez-local entity
      ([ADR-0018](decisions/0018-deadlines-and-limitation.md), [deadlines.md](deadlines.md)): a
      `DeadlineStore` + `DeadlineService`, a **provisional** limitation calculator
      (`LIMITATION_RULES` / `computeLimitationDeadline` — needs legal sign-off), and a deadline
      digest mirroring hearings; plus a Munshi **hearing-prep brief** (`hearingPrepMessage`).
- [~] **Identity & auth** — Firm (tenant) + User (roles) + an `AuthService`
      ([`@nowlez/auth`](../packages/auth)) supporting **phone OTP / email + password / Google**
      sign-in over ports, with offline fakes and `scrypt` hashing
      ([ADR-0019](decisions/0019-auth-and-identity.md), [auth.md](auth.md)). The **server `/auth`
      routes + bearer middleware** are wired (OTP over WhatsApp / Google tokeninfo by env). The
      **per-tenant scoping mechanism** (`engine.forFirm` — fully isolated per-firm services), **auth
      enforcement** (`NOWLEZ_REQUIRE_AUTH` → 401 on firm-owned routes; 6b-2a), and **`forFirm` wired
      through every route** (6b-2b: each route, the Munshi context, the refresh cycle, and the
      WhatsApp channel resolve the request's firm; the scheduler fans across firms — isolation-tested
      end-to-end) are built; RBAC, login UIs, and hardening (OTP rate-limit, cookie/CSRF) remain.
- [x] Tests covering the slice (against the mock).

**Exit criteria:** a user can add a case by CNR and view its orders, against stubbed data.

## Phase 3 — Ingestion pipeline (real)

- [x] Normalisation for all formats (PDF / doc/docx / image → page images) — via the
      `DocumentRenderer` port ([ADR-0008](decisions/0008-document-renderer-port.md)); the real
      `PdfjsDocumentRenderer` is built (injected pdfjs engine + canvas rasteriser, tested with fakes).
      docx→pdf still needs an office converter.
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
- [ ] OnlyOffice editor + Create New document — **Create document** is wired (seeds a Munshi
      draft; documents are authored via `write_docx`), and a file's **Edit** opens an `OnlyOfficeEditor`
      that embeds the Document Server when `VITE_ONLYOFFICE_URL` is set, else a clear placeholder
      (ADR-0005). A running Document Server can't be exercised in CI, so the embed is the remaining piece.
- [x] docx-js → docx → PDF-preview pipeline — `DocxPipeline` compiles docx-js in a sandbox
      ([ADR-0012](decisions/0012-docx-sandbox.md)) and renders a PDF preview via the renderer.
- [x] **write_docx → store → read_docx** round-trip — the compiled `.docx` is persisted in a
      [`BlobStore`](decisions/0014-blob-store-port.md) ([`@nowlez/storage`](../packages/storage))
      and attached as an AI-drafted [File](data-model.md#file); `read_docx` reads it back via
      Mammoth ([`@nowlez/document-handling`](../packages/document-handling)).
- [x] URL web viewer — the working-area pane renders an external URL in an iframe; clicking a
      Munshi **url citation** opens it there (subject to the site's framing policy).

## Phase 6 — Real eCourts source

- [ ] Real `CourtDataSource` — **`EcourtsMobileSource`**
      ([ADR-0016](decisions/0016-ecourts-mobile-source.md)) is built behind the port: **all six
      operations** mapped over an injectable transport + the **verified codec**
      ([`ecourts-codec.ts`](../packages/court-data/src/ecourts-codec.ts), extracted in the
      [2026-06-07 teardown](research/2026-06-07-ecourts-apk-teardown.md) and KAT-proven), selectable via
      `NOWLEZ_COURT_SOURCE=ecourts-mobile` and reported by `GET /config`. **Remaining (externally
      gated):** **legal/compliance sign-off**, an optional response-shape confirmation (see the
      [go-live runbook](runbooks/ecourts-mitm-and-codec.md)), and the web-portal fallback
      (`ecourts-web`, still a stub).
- [x] Rate-limiting & caching at the seam — `CachingCourtDataSource` (the **fetch-once / fan-out**
      window) + `RateLimitedCourtDataSource`, wired into `selectCourtDataSourceFromEnv` via
      `NOWLEZ_COURT_CACHE_TTL_MS` / `NOWLEZ_COURT_MIN_INTERVAL_MS` (off by default). Multi-tenant
      fan-out semantics await the auth/tenancy model.
- [x] Daily refresh + alert engine — the diff engine ([`@nowlez/tracking`](../packages/tracking))
      with the **alert-worthy catalogue** (new orders + next-hearing/status changes alert; others
      silent) and **case lifecycle** (`refreshAll` skips disposed cases), plus alert
      **persistence + delivery**: alerts are stored via an
      [`AlertStore`](decisions/0015-alert-store-and-delivery.md), served as a feed (`GET /alerts`,
      mark-read) the web renders, and pushed best-effort over WhatsApp. The cycle (`runRefreshCycle`)
      runs on demand (`POST /refresh`) or on a timer via an opt-in **scheduler**
      (`NOWLEZ_REFRESH_INTERVAL_MS`; external cron can call it too). The **hearing digest**
      (`buildHearingDigest` / `GET /hearings`) adds the
      [*never miss a hearing*](alerts-and-tracking.md#never-miss-a-hearing) overview — tracked,
      active cases bucketed overdue / today / this week, surfaced in web, CLI, and WhatsApp. A
      **daily briefing** (`buildDailyBriefing` / `GET /briefing`) joins imminent hearings + unread
      alerts, and a `Notifier` pushes alerts / briefing per single-tenant **notification
      preferences** (`NOWLEZ_PUSH_ALERTS` / `_ALERT_KINDS` / `_DAILY_BRIEFING`). **Fetch-once /
      fan-out**, **multi-recipient routing**, and time-of-day/staggering policy remain.
- [x] Cause-list cross-referencing — implemented in
      [Case Management](../packages/case-management) (against the mock).
- [ ] Keep web-portal / commercial fallbacks swappable via the single selector.

## Phase 7 — Front-ends

- [x] A **CLI** entrypoint ([`@nowlez/cli`](../apps/cli)) — add/list cases, cause-list, **hearings**,
      **briefing**, **clients** (add / assign / client-update), **deadlines** (+ **prep** brief),
      refresh (alerts), and ask the Munshi; cases persist via the file repository.
- [x] An **HTTP API** ([`@nowlez/server`](../apps/server), Hono —
      [ADR-0011](decisions/0011-http-api-hono.md)) exposing the engine for the front-ends.
- [x] [Web app](interfaces.md#web-application) — a three-pane Vite + React shell
      ([`@nowlez/web`](../apps/web)) over the HTTP API: case list, add-case (by CNR or by
      **searching** party / case number), a **Today** briefing banner, an **alerts feed** (mark-read),
      an **upcoming-hearings** digest, a daily **cause list**, a **Clients** section (add clients,
      assign a case, send a client update), a **Deadlines** digest, and Munshi chat with **cited
      replies**. Selecting a case shows its **details, orders, and files**, its **client** and
      **deadlines** (add by date or limitation rule), a **Prep brief** button, a **track/untrack**
      toggle and an **expandable orders/files tree** in the left
      pane — files **download** or **preview** (PDF/image inline, `.docx` as text), the user can
      **upload** or **Create document** (seeds a Munshi draft), and the Munshi chat shows its **live
      tool-call trace** + cited replies.
- [ ] [Mobile app](interfaces.md#mobile-application) (CASES / MUNSHI) — the **data layer** is built
      ([`@nowlez/mobile`](../apps/mobile): `NowlezClient` over the HTTP API + a `createMobileApp()`
      CASES/MUNSHI view-model, transport-injectable + tested). The thin **React Native shell** that
      renders it is the remaining piece (a Metro/RN toolchain can't run in CI).
- [x] [WhatsApp](interfaces.md#whatsapp) channel — a `WhatsAppClient` port + Meta adapter
      ([`@nowlez/whatsapp`](../packages/whatsapp), [ADR-0013](decisions/0013-whatsapp-channel.md));
      the inbound webhook routes a **command set**
      (`case`/`orders`/`file`/`cause-list`/`hearings`/`briefing`/`help`, a bare CNR) with anything
      else → Munshi, and **`sendDocument`** delivers a stored file as media
      (Meta upload-then-send). Order/cause-list **PDF rendering** (for media) still depends on the
      renderer.

---

> Phases 3+ are sketched at lower resolution on purpose; they will be refined as earlier
> phases land and the [open questions](open-questions.md) are answered.
