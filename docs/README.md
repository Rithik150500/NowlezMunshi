# NowLez Documentation

This directory is the **source of truth** for NowLez. These documents define what we are
building and why; the Phase-1 scaffold in [`../packages/`](../packages) is the first code
that implements them. Docs and code are meant to agree — if they ever disagree, that's a
bug in one of them, to be fixed in the same change.

## How to read this

If you are new, read in this order:

1. [`overview.md`](overview.md) — what NowLez is, who it's for, and its scope.
2. [`architecture.md`](architecture.md) — the four layers, the two AI models, and how
   they depend on each other.
3. [`data-model.md`](data-model.md) — the core entities (Case, Order, File, Mini-Detail,
   User) and the all-important role of the CNR.

Then dive into a layer that interests you:

- [`case-management.md`](case-management.md) — how a case enters NowLez and stays current.
- [`file-management.md`](file-management.md) — the ingestion pipeline that turns documents
  into structured summaries.
- [`munshi.md`](munshi.md) — the AI assistant: context assembly, citation discipline,
  and its toolset.
- [`document-handling.md`](document-handling.md) — viewing, editing, and rendering documents.

Cross-cutting concerns:

- [`ecourts-integration.md`](ecourts-integration.md) — the source-agnostic court-data
  interface and how data is obtained from eCourts.
- [`alerts-and-tracking.md`](alerts-and-tracking.md) — the daily refresh cycle and what
  counts as alert-worthy.

Surfaces:

- [`interfaces.md`](interfaces.md) — the web, mobile, and WhatsApp front-ends.

Implementation:

- [`contracts.md`](contracts.md) — the **design contracts** (the `@nowlez/contracts` package):
  the data model, the `CourtDataSource` interface, the Munshi tool schemas, and the ingestion
  schema. The Phase-1 scaffold lives in [`../packages/`](../packages) (the four layers + the
  contracts + the court-data seam) and [`../apps/`](../apps) (front-end placeholders).

The "why" and the "what's missing":

- [`decisions/`](decisions/) — Architecture Decision Records for the load-bearing choices.
- [`open-questions.md`](open-questions.md) — everything the specification leaves undecided,
  collected in one place so nothing gets silently invented during the build.
- [`research/`](research/) — dated, fact-checked research reports that inform the decisions and
  open questions (eCourts feasibility, Gemma models, the competitive landscape).

Planning & reference:

- [`roadmap.md`](roadmap.md) — the phased plan from documentation to a working product.
- [`glossary.md`](glossary.md) — domain terminology.

## Conventions

- **Faithfulness over invention.** These docs reflect the agreed specification. Where the
  spec is silent, the gap is recorded in [`open-questions.md`](open-questions.md) and marked
  inline as an **open question** — it is *not* filled in with a guess presented as fact.
- **Decisions are durable.** Load-bearing or hard-to-reverse choices live in
  [`decisions/`](decisions/) as ADRs. Supersede an ADR with a new one rather than editing
  the decision out of history.
- **Link, don't repeat.** Define a term once (in the [glossary](glossary.md)) and link to it.
