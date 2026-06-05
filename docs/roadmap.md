# Roadmap

A phased plan from "specification on paper" to "working product". Phases are ordered by
dependency, not by calendar. The **technology stack is intentionally undecided** until
Phase 1 — see [open questions](open-questions.md#stack--platform).

## Phase 0 — Foundation _(in progress)_

**Goal:** a navigable, faithful source of truth.

- [x] Capture the specification as structured docs (this `docs/` set).
- [x] Record the load-bearing decisions as [ADRs](decisions/).
- [x] Collect everything the spec leaves undecided in [open questions](open-questions.md).
- [ ] Review & sign-off of the docs with the product owner.

**Exit criteria:** the docs are agreed as the shared reference everyone builds against.

## Phase 1 — Scaffold _(next — needs a stack decision)_

**Goal:** a project skeleton future sessions can fill in.

- [ ] **Decide the stack** (see [ADR placeholder / open question](open-questions.md#stack--platform)).
- [ ] Repository structure for the four layers + the front-ends.
- [ ] Define the **`CourtDataSource` interface** ([ADR-0002](decisions/0002-source-agnostic-court-data-interface.md))
      with a **stub/mock implementation** — no real eCourts calls yet.
- [ ] Stub modules for Case Management, File Management, Munshi, Document Handling.
- [ ] Project tooling: dependency manager, formatter/linter, test runner, CI.
- [ ] A [SessionStart hook](https://code.claude.com/docs/en/claude-code-on-the-web) so web
      sessions can run tests/linters.

**Exit criteria:** `the project builds, lints, and runs an empty test suite green`.

## Phase 2 — MVP slice (add-case-by-CNR, end to end)

**Goal:** one thin vertical slice proving the architecture.

- [ ] Add a case **by CNR** through the **stubbed** `CourtDataSource`.
- [ ] Persist a [Case](data-model.md#case) (CNR as sole PK) with its
      [Orders](data-model.md#order).
- [ ] Render an order PDF to **page images** (ingestion step 1).
- [ ] A minimal viewer to read it back.
- [ ] Tests covering the slice end to end.

**Exit criteria:** a user can add a case by CNR and view its orders, against stubbed data.

## Phase 3 — Ingestion pipeline (real)

- [ ] Normalisation for all formats (PDF / doc/docx / image → page images).
- [ ] Wire the **smaller Gemma 4** model for classification + summarisation.
- [ ] Populate document type, summaries, and Case [Mini-Details](data-model.md#case-mini-detail--summary).

## Phase 4 — Munshi (real)

- [ ] [Context assembly](munshi.md#context-assembly) from mini-details + instructions.
- [ ] The **larger Gemma 4** tool-calling loop.
- [ ] Tools: read, web search (Tavily), read docx, write docx, ask-user-question,
      full case details.
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
- [ ] Daily refresh + alert engine (alert-worthy vs. silent).
- [ ] Cause-list cross-referencing.
- [ ] Keep web-portal / commercial fallbacks swappable via the single selector.

## Phase 7 — Front-ends

- [ ] [Web app](interfaces.md#web-application) (three-pane).
- [ ] [Mobile app](interfaces.md#mobile-application) (CASES / MUNSHI).
- [ ] [WhatsApp](interfaces.md#whatsapp) channel.

---

> Phases 3+ are sketched at lower resolution on purpose; they will be refined as earlier
> phases land and the [open questions](open-questions.md) are answered.
