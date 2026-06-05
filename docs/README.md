# NowLez Documentation

This directory is the **source of truth** for NowLez. There is no application code
yet; these documents define what we are building and why, so that future
implementation work has a stable foundation to build against.

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

The "why" and the "what's missing":

- [`decisions/`](decisions/) — Architecture Decision Records for the load-bearing choices.
- [`open-questions.md`](open-questions.md) — everything the specification leaves undecided,
  collected in one place so nothing gets silently invented during the build.

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
