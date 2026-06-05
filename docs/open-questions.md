# Open Questions

Everything the specification leaves undecided, collected so that gaps are **answered
deliberately** rather than silently invented during the build. Each item notes what the spec
*does* say (if anything) and what still needs a decision.

> When an item here is resolved, capture the decision — in the relevant doc for small
> choices, or as a new [ADR](decisions/) for load-bearing ones — and strike it from this list.

## Stack & platform

- [ ] **Backend/core language & framework.** Deferred by explicit choice. Candidates noted in
      discussion: Python (e.g. FastAPI) vs. TypeScript/Node. Blocks [Phase 1](roadmap.md#phase-1--scaffold).
- [ ] **Web front-end framework** (the three-pane app).
- [ ] **Mobile framework** (native vs. cross-platform for CASES/MUNSHI).
- [ ] **Datastore** (relational vs. document) and **object storage** for PDFs/images.
- [ ] **Hosting / deployment** model and environments.
- [ ] **Licensing** — no license has been chosen for this repository yet.

## Data model

- [ ] Concrete column types, nullability, and indexing for Case / Order / File / Mini-Detail.
- [ ] Where binary content lives (DB blobs vs. object storage) and how page images are keyed.
- [ ] Order ID and File ID generation scheme (and whether they are globally unique or
      per-case).
- [ ] Multi-user ownership: can two users own/track the same case independently, and how does
      that interact with [fetch-once / fan-out](alerts-and-tracking.md#fetch-once-fan-out)?
- [ ] Auth, accounts, and tenancy model for [User](data-model.md#user).

## eCourts integration

- [ ] Exact `CourtDataSource` method signatures and request/response shapes.
- [ ] Auth/session handling for the mobile-app backend; token lifecycle.
- [ ] Whether the mobile backend requires **device-integrity attestation** (the spec names
      this as the key fallback trigger) — needs investigation.
- [ ] Where **rate-limiting** and **caching** live, and their parameters.
- [ ] Legal/compliance review of extracting from the eCourts mobile app
      ([ADR-0004](decisions/0004-extract-from-ecourts-mobile-app.md) — Risks).

## Alerts & tracking

- [ ] The precise catalogue of **alert-worthy vs. routine/cosmetic** field changes (the spec
      only commits to "new orders are alert-worthy").
- [ ] Notification **delivery channels** and user preferences per channel.
- [ ] Daily refresh **scheduling** (time of day, time zone, staggering to respect rate limits).

## File management

- [ ] Page-image **resolution / format** and the rendering toolchain.
- [ ] Exact **prompt and response schema** for the smaller Gemma 4 classification call.
- [ ] Document **de-duplication** (same order/file arriving twice).
- [ ] **Failure/retry** handling and idempotency in the pipeline.

## Munshi

- [ ] Prompt templates and the exact **tool JSON schemas**.
- [ ] Agent **loop / stopping conditions** and max tool-call depth.
- [ ] **Voice input** transcription approach.
- [ ] How [inline citations](munshi.md#citation-discipline) are **validated** (e.g. rejecting
      citations to non-existent Order/File IDs or pages).
- [ ] Hosting for the two **Gemma 4** models (sizes/quantisation, self-host vs. hosted).
- [ ] Cross-case privacy: the context is "all of the user's cases" — confirm no cross-user
      leakage in multi-tenant deployments.

## Document handling

- [ ] PDF **renderer** choice.
- [ ] **OnlyOffice** deployment model (self-hosted vs. hosted) and licensing.
- [ ] **docx-js execution sandbox** (the Munshi emits code that must run safely).

## Interfaces

- [ ] Exact **feature parity** across web / mobile / WhatsApp where the spec isn't explicit
      (see the coverage table in [`interfaces.md`](interfaces.md#capability-coverage-across-surfaces)).
- [ ] WhatsApp provider / Business API details.
- [ ] Offline / sync behaviour on mobile.
