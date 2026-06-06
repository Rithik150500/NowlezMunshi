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
- [ ] **Datastore engine** (object storage resolved). Persistence goes through a `CaseRepository`
      port ([ADR-0007](decisions/0007-persistence-port.md)) with in-memory + durable file
      adapters; the production engine (**SQLite** recommended) is still to be chosen. Object
      storage is now a `BlobStore` port ([ADR-0014](decisions/0014-blob-store-port.md)) with
      in-memory + filesystem adapters — a cloud store (S3/GCS) is a future adapter behind it.
- [ ] **Hosting / deployment** model and environments.
- [ ] **Licensing** — no license has been chosen for this repository yet.

## Data model

- [ ] Concrete column types, nullability, and indexing for Case / Order / File / Mini-Detail.
      *(The conceptual types now exist in [`@nowlez/contracts`](contracts.md); the
      persistence/storage mapping is still open.)*
- [x] ✅ Where binary content lives — **object storage** behind the `BlobStore` port
      ([ADR-0014](decisions/0014-blob-store-port.md)), referenced by a `BinaryRef` (never inlined
      in the case record); how page images are **keyed**, and blob **lifecycle/GC**, remain open.
- [ ] Order ID and File ID generation scheme (and whether they are globally unique or
      per-case).
- [ ] Multi-user ownership: can two users own/track the same case independently, and how does
      that interact with [fetch-once / fan-out](alerts-and-tracking.md#fetch-once-fan-out)?
- [~] **Auth, accounts, and tenancy model** for [User](data-model.md#user) — **core decided/built**
      ([ADR-0019](decisions/0019-auth-and-identity.md), [auth.md](auth.md)): the **firm** is the
      tenant, with an `AuthService` (phone OTP / email + password / Google) over ports. **Remaining:**
      server `/auth` routes + middleware, **per-tenant scoping** of every query (6b), RBAC
      enforcement, login UIs, and production hardening — **OTP rate-limiting**, web **cookie/CSRF**,
      and secret management.
- [ ] **Clients: portal & multi-advocate ownership** — clients are a single-advocate **local** entity
      ([ADR-0017](decisions/0017-clients-local-entity.md), [clients.md](clients.md)); whether a client
      gets a login / portal, and whether two advocates can share or co-own a client, await the
      auth/tenancy model.
- [ ] 🔴 **Limitation periods need legal sign-off** — the `LIMITATION_RULES` catalogue
      ([deadlines.md](deadlines.md), [ADR-0018](decisions/0018-deadlines-and-limitation.md)) is
      **provisional and illustrative**. The real periods, their exact triggers, exclusions (e.g. time
      to obtain a certified copy, §12 Limitation Act), and condonation must be confirmed by a lawyer
      before any real-world use — a blocking prerequisite, like the eCourts legal review.

## eCourts integration

> **Elevated by the [2026-06-05 research report](research/2026-06-05-ecourts-gemma-landscape.md).**
> Research found the mobile-app premise of
> [ADR-0004](decisions/0004-extract-from-ecourts-mobile-app.md) unsubstantiated; the *proven* path is
> the **web-portal scrape + CAPTCHA-OCR**. The first three items are now **blocking** for any real
> court-data work.

- [x] 🔴 **(Static half done)** Validate the mobile-app premise — a
      [static APK teardown](research/2026-06-05-ecourts-apk-teardown.md) of v4.0.1 confirms the mobile
      backend (`app.ecourts.gov.in/services_*`) is **CAPTCHA-free and attestation-free**; the barrier
      is **client-side request-parameter encryption**. **Decided:** build the mobile-app source and
      **replicate the param encryption** behind a codec seam — a provisional
      [`EcourtsMobileSource`](decisions/0016-ecourts-mobile-source.md) now exists. **Remaining:** a
      **dynamic MITM capture** to confirm the exact request format + supply the real codec.
- [ ] 🔴 **Legal / compliance review** of automated extraction (web portal *or* app): §43 IT Act 2000,
      DPDP, and eCourts ToS — a real, unsettled risk independent of the low technical barrier.
- [ ] 🟡 **Can a private product obtain *authorized* official access?** Official APIs (NAPIX, NJDG,
      Kerala DigiCourt) exist but are gated to government / authorized partners — confirm directly via
      NAPIX onboarding and the relevant High Court's API cell whether NowLez could ever qualify.
- [ ] CAPTCHA-OCR strategy and accuracy/retry budget for the web-portal implementation.
- [ ] Exact `CourtDataSource` method signatures and request/response shapes.
      *(A provisional interface exists in [`@nowlez/contracts`](contracts.md), and
      [`EcourtsMobileSource`](decisions/0016-ecourts-mobile-source.md) maps a **provisional** wire
      shape isolated to one file; both are to be confirmed against a real capture.)*
- [ ] Auth/session handling (`app_token` / `__csrf_magic` / session cookie) and token lifecycle.
- [x] ✅ Where **rate-limiting** and **caching** live — at the `CourtDataSource` seam, as
      `RateLimitedCourtDataSource` + `CachingCourtDataSource` decorators wired into
      `selectCourtDataSourceFromEnv` (`NOWLEZ_COURT_MIN_INTERVAL_MS` / `NOWLEZ_COURT_CACHE_TTL_MS`).
      Production *values* (and per-court limits) are still to be tuned against the real source.

## Alerts & tracking

- [x] ✅ The catalogue of **alert-worthy vs. routine/cosmetic** field changes —
      [`@nowlez/tracking`](../packages/tracking) `diffCase` alerts on new orders, **next-hearing-date**
      and **status (incl. disposal)** changes; other watched fields update silently. **Case
      lifecycle**: `refreshAll` skips disposed cases (`caseLifecycle`). The exact field set is one
      table in `diff.ts` and easy to extend as product rules firm up.
- [x] ✅ Notification **delivery** — alerts are persisted
      ([AlertStore](decisions/0015-alert-store-and-delivery.md)), served as a feed (`GET /alerts`,
      mark-read), and routed through a `Notifier` per single-tenant **preferences**
      (`NOWLEZ_PUSH_ALERTS` / `_ALERT_KINDS` / `_DAILY_BRIEFING`): alert pushes plus an opt-in
      **daily briefing** (`GET /briefing`) over WhatsApp. **Per-user** preferences and
      **multi-recipient routing** still depend on the auth/tenancy model.
- [x] ✅ Daily refresh **scheduling** — an opt-in in-process scheduler runs `runRefreshCycle` on an
      interval (`NOWLEZ_REFRESH_INTERVAL_MS`; external cron can call the same cycle). Time-of-day /
      time-zone policy and **staggering** to respect rate limits remain.
- [ ] **Hearing-digest horizon & time-zone** — `buildHearingDigest`
      ([never miss a hearing](alerts-and-tracking.md#never-miss-a-hearing)) buckets against **UTC**
      days with a default **7-day** "this week" window. The advocate's **local court time-zone**, the
      right default horizon, and whether an **overdue** hearing should auto-nudge a re-fetch are
      product choices to confirm against real usage.

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

- [ ] Prompt templates. *(The **tool schemas**, **context assembly**, and a **multi-turn
      tool-calling loop** (bounded by a max-steps cap, with a handler registry) now exist in
      `@nowlez/munshi` with `DEFAULT_MUNSHI_INSTRUCTIONS`; the exact prompt wording remains
      provisional.)*
- [ ] Agent **loop / stopping conditions** and max tool-call depth.
- [ ] **Voice input** transcription approach.
- [x] ✅ How [inline citations](munshi.md#citation-discipline) are **validated** — the Munshi
      checks each cited CNR / Order ID / File ID **and page number** against the caseload
      (`isKnownCitation`; page counts ride in `CaseMiniDetail`), gives the model one correction
      prompt, then strips any it still can't verify.
- [ ] Hosting for the two **Gemma 4** models (sizes/quantisation, self-host vs. hosted).
      *(They are reached through the `ModelClient` port — env-driven OpenAI-compatible,
      [ADR-0009](decisions/0009-model-client-port.md); the actual endpoint / model ids are a
      deployment choice. Licensing resolved: Gemma 4 is **Apache 2.0** — see
      [research](research/2026-06-05-ecourts-gemma-landscape.md).)*
- [ ] Cross-case privacy: the context is "all of the user's cases" — confirm no cross-user
      leakage in multi-tenant deployments.

## Document handling

- [x] ✅ PDF **renderer** choice. Rendering goes through a `DocumentRenderer` port
      ([ADR-0008](decisions/0008-document-renderer-port.md)); the real `PdfjsDocumentRenderer` is
      built (page loop over an injected pdfjs-dist engine + canvas rasteriser, tested with fakes).
      Wiring the native engine/canvas at runtime and the page-image **resolution/format** remain;
      docx→pdf still needs an office converter.
- [ ] **OnlyOffice** deployment model (self-hosted vs. hosted) and licensing.
- [ ] **docx-js execution sandbox** — a `node:vm` containment adapter ships now
      ([ADR-0012](decisions/0012-docx-sandbox.md)); production needs a real isolate
      (`isolated-vm` / worker) behind the same `DocxCompiler` port for untrusted input.

## Interfaces

- [ ] Exact **feature parity** across web / mobile / WhatsApp where the spec isn't explicit
      (see the coverage table in [`interfaces.md`](interfaces.md#capability-coverage-across-surfaces)).
- [x] ✅ WhatsApp provider — the **Meta WhatsApp Cloud API**
      ([ADR-0013](decisions/0013-whatsapp-channel.md)); an inbound **command set**
      (`case`/`orders`/`file`/`cause-list`/`help`, bare CNR, else → Munshi) is wired, and
      `sendDocument` delivers a stored file as **media** (upload-then-send). Webhook **signature
      verification** and **rendering order/cause-list PDFs** (for media) remain open.
- [ ] Offline / sync behaviour on mobile.
