# Open Questions

Everything the specification leaves undecided, collected so that gaps are **answered
deliberately** rather than silently invented during the build. Each item notes what the spec
*does* say (if anything) and what still needs a decision.

> When an item here is resolved, capture the decision — in the relevant doc for small
> choices, or as a new [ADR](decisions/) for load-bearing ones — and strike it from this list.
>
> 📄 Several items below were **elevated or partly answered** by the
> [2026-06-05 research report](research/2026-06-05-ecourts-gemma-landscape.md) — flagged inline.

## Stack & platform

- [x] ✅ **Backend/core language & framework.** Resolved: a **TypeScript monorepo (pnpm)** —
      see [ADR-0006](decisions/0006-typescript-monorepo-stack.md).
- [ ] **Web front-end framework** (the three-pane app) — now within the TypeScript ecosystem
      (e.g. a React-based app); the specific framework is still open.
- [ ] **Mobile framework** — React Native would keep it in-stack, but native vs. cross-platform
      for CASES/MUNSHI is still open.
- [ ] **Datastore engine** & **object storage**. Persistence now goes through a `CaseRepository`
      port ([ADR-0007](decisions/0007-persistence-port.md)) with in-memory + durable file
      adapters; the production engine (**SQLite** recommended) and a `BlobStore` for
      PDFs/page images are still to be chosen.
- [ ] **Hosting / deployment** model and environments.
- [ ] **Licensing** — no license has been chosen for this repository yet.

## Data model

- [ ] Concrete column types, nullability, and indexing for Case / Order / File / Mini-Detail.
      *(The conceptual types now exist in [`@nowlez/contracts`](contracts.md); the
      persistence/storage mapping is still open.)*
- [ ] Where binary content lives (DB blobs vs. object storage) and how page images are keyed.
- [ ] Order ID and File ID generation scheme (and whether they are globally unique or
      per-case).
- [ ] Multi-user ownership: can two users own/track the same case independently, and how does
      that interact with [fetch-once / fan-out](alerts-and-tracking.md#fetch-once-fan-out)?
- [ ] Auth, accounts, and tenancy model for [User](data-model.md#user).

## eCourts integration

> **Elevated by the [2026-06-05 research report](research/2026-06-05-ecourts-gemma-landscape.md).**
> Research found the mobile-app premise of
> [ADR-0004](decisions/0004-extract-from-ecourts-mobile-app.md) unsubstantiated; the *proven* path is
> the **web-portal scrape + CAPTCHA-OCR**. The first three items are now **blocking** for any real
> court-data work.

- [x] 🔴 **(Static half done)** Validate the mobile-app premise — a
      [static APK teardown](research/2026-06-05-ecourts-apk-teardown.md) of v4.0.1 confirms the mobile
      backend (`app.ecourts.gov.in/services_*`) is **CAPTCHA-free and attestation-free**; the barrier
      is **client-side request-parameter encryption**. **Remaining:** a **dynamic MITM capture** to
      confirm the exact request format, and a decision on whether to **replicate the per-release param
      encryption**. Until decided, default to the **web-portal scrape**.
- [ ] 🔴 **Legal / compliance review** of automated extraction (web portal *or* app): §43 IT Act 2000,
      DPDP, and eCourts ToS — a real, unsettled risk independent of the low technical barrier.
- [ ] 🟡 **Can a private product obtain *authorized* official access?** Official APIs (NAPIX, NJDG,
      Kerala DigiCourt) exist but are gated to government / authorized partners — confirm directly via
      NAPIX onboarding and the relevant High Court's API cell whether NowLez could ever qualify.
- [ ] CAPTCHA-OCR strategy and accuracy/retry budget for the web-portal implementation.
- [ ] Exact `CourtDataSource` method signatures and request/response shapes.
      *(A provisional interface now exists in [`@nowlez/contracts`](contracts.md); the shapes
      are to be confirmed against a real source.)*
- [ ] Auth/session handling (`app_token` / `__csrf_magic` / session cookie) and token lifecycle.
- [ ] Where **rate-limiting** and **caching** live, and their parameters.

## Alerts & tracking

- [ ] The precise catalogue of **alert-worthy vs. routine/cosmetic** field changes (the spec
      only commits to "new orders are alert-worthy"). *(The engine in
      [`@nowlez/tracking`](../packages/tracking) implements that default — new orders alert;
      watched detail fields update silently — pending the full catalogue.)*
- [ ] Notification **delivery channels** and user preferences per channel.
- [ ] Daily refresh **scheduling** (time of day, time zone, staggering to respect rate limits).

## File management

- [ ] **Benchmark the ingestion vision model** — compare small **Gemma 4 (E2B/E4B)** against
      **Qwen-VL** and a dedicated OCR model (e.g. **Mistral OCR 3**, ~$2/1k pages) on *real* order
      pages before locking it in ([research](research/2026-06-05-ecourts-gemma-landscape.md)); Gemma's
      edge is price + Apache-2.0, not top doc-VQA accuracy.
- [ ] Page-image **resolution / format** and the rendering toolchain.
- [ ] Exact **prompt and response schema** for the smaller Gemma 4 classification call.
      *(The response schema is captured in [`@nowlez/contracts`](contracts.md); the prompt
      and request framing remain open.)*
- [ ] Document **de-duplication** (same order/file arriving twice).
- [ ] **Failure/retry** handling and idempotency in the pipeline.

## Munshi

- [ ] Prompt templates and the agent loop. *(The **tool input schemas** — and JSON Schemas
      derived from them — now exist in [`@nowlez/contracts`](contracts.md); prompt wording and
      the loop/stopping conditions remain open.)*
- [ ] Agent **loop / stopping conditions** and max tool-call depth.
- [ ] **Voice input** transcription approach.
- [ ] How [inline citations](munshi.md#citation-discipline) are **validated** (e.g. rejecting
      citations to non-existent Order/File IDs or pages).
- [ ] Hosting for the two **Gemma 4** models (sizes/quantisation, self-host vs. hosted).
      *(Licensing resolved: Gemma 4 is **Apache 2.0** — see
      [research](research/2026-06-05-ecourts-gemma-landscape.md).)*
- [ ] Cross-case privacy: the context is "all of the user's cases" — confirm no cross-user
      leakage in multi-tenant deployments.

## Document handling

- [x] ✅ PDF **renderer** choice. Rendering goes through a `DocumentRenderer` port
      ([ADR-0008](decisions/0008-document-renderer-port.md)); the real impl is named
      (pdfjs-dist + a prebuilt canvas) and deferred until real document bytes flow.
- [ ] **OnlyOffice** deployment model (self-hosted vs. hosted) and licensing.
- [ ] **docx-js execution sandbox** (the Munshi emits code that must run safely).

## Interfaces

- [ ] Exact **feature parity** across web / mobile / WhatsApp where the spec isn't explicit
      (see the coverage table in [`interfaces.md`](interfaces.md#capability-coverage-across-surfaces)).
- [ ] WhatsApp provider / Business API details.
- [ ] Offline / sync behaviour on mobile.
