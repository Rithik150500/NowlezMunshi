# ADR-0016 — eCourts Services mobile-app CourtDataSource

**Status:** Accepted (Phase 6) — **codec verified; live use gated on legal sign-off**

> **Update (2026-06-07): the codec is now real.** The [2026-06-07 APK teardown](../research/2026-06-07-ecourts-apk-teardown.md)
> (a Cordova/WebView build) recovered the full request/response scheme from plain JS, now implemented
> in [`ecourts-codec.ts`](../../packages/court-data/src/ecourts-codec.ts) and **proven byte-identical**
> to the app's own CryptoJS by a known-answer test — no live call, no MITM. The transport/codec seams
> below are now wired to the **verified** protocol: `GET …?params=<AES blob>`,
> `Authorization: Bearer <encrypt(token)>`, AES-encrypted response bodies, and the real `*.php`
> endpoints under `ecourt_mobile_DC/` / `ecourt_mobile_HC/`. The passthrough default
> (`identityParamCodec`) is replaced by the real `createEcourtsCodec()`; an `identityEcourtsCodec`
> remains for offline tests. **Still provisional:** the inner response field names + the token
> bootstrap/401 path (need an authorized live capture — see the
> [go-live runbook](../runbooks/ecourts-mitm-and-codec.md)). **Unchanged:** the source is off by
> default and live use is gated on legal/compliance sign-off. The original (provisional) decision is
> preserved below for history.

## Context

[ADR-0004](0004-extract-from-ecourts-mobile-app.md) chose the **eCourts Services mobile-app
backend** as the primary court-data path, and the
[APK teardown](../research/2026-06-05-ecourts-apk-teardown.md) validated the premise: the backend
(`app.ecourts.gov.in`) is **CAPTCHA-free and attestation-free**, and the one technical barrier is
the app's **per-release request-parameter encryption**. Confirming the exact request/response
format needs a **dynamic MITM capture**, and the **legal/compliance** question (§43 IT Act, DPDP,
eCourts ToS) is unresolved ([open questions](../open-questions.md#ecourts-integration)). The
product owner directed building this source.

We can't reach `app.ecourts.gov.in` from the build/CI sandbox, and the wire format isn't yet
captured — so the goal is to build **everything around the unknowns**, testably, leaving the
unknowns as small isolated seams.

## Decision

Implement **`EcourtsMobileSource`** (in [`@nowlez/court-data`](../../packages/court-data)) behind
the existing [`CourtDataSource`](0002-source-agnostic-court-data-interface.md) port:

- An **injectable `EcourtsTransport`** (defaults to `fetch`) — so request-building and
  response-mapping are unit-tested against canned responses, no network.
- A **pluggable `EcourtsParamCodec`** — the **request-encryption seam**. The default is a
  passthrough (`identityParamCodec`); the production codec replicates the app's algorithm once a
  MITM capture provides it.
- **All operations mapped** against the provisional shapes — `getCaseByCnr`, `getOrders`,
  `getCaseByQr`, `searchByParty`, `searchByCaseNumber`, `getCauseList` — each building request
  params, encoding via the codec, and mapping the response to the contract DTOs.
- Selectable via **`NOWLEZ_COURT_SOURCE=ecourts-mobile`** (or `selectCourtDataSource`); the
  base URL is `NOWLEZ_ECOURTS_BASE_URL` (provisional default `https://app.ecourts.gov.in`).
- **Operational discipline at the seam** (the contract requires it): a TTL cache
  (`NOWLEZ_COURT_CACHE_TTL_MS`, the fetch-once/fan-out window) and a rate limiter
  (`NOWLEZ_COURT_MIN_INTERVAL_MS`) as decorators in `selectCourtDataSourceFromEnv`, off by default.

The **endpoint path, parameter names, and JSON field names are PROVISIONAL** — assumptions marked
loudly in the code and exercised by tests against those same assumed shapes. They are confined to
one file (the raw shape + `mapFetchedCase`), so a confirmed capture is a small, local change.

## Consequences

- The **hard plumbing is built and green offline**: the port wiring, transport injection,
  response → DTO mapping, error handling, and the env selector — with the externally-unknowable
  pieces (the encryption, the exact shapes) isolated behind seams.
- **Not usable against the live endpoint yet.** Going live still needs: the real **param codec**
  (MITM-derived), **confirmed wire shapes**, **rate-limiting / caching / fetch-once-fan-out**
  ([alerts-and-tracking.md](../alerts-and-tracking.md)), and **legal/compliance sign-off**.
- **Risk:** the provisional shapes are educated guesses; they must not be presented as verified.
  `GET /config` reports the court source as live when selected, but "live" means *wired*, not
  *validated*.

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Mobile-app source, built around the unknowns | **Chosen** | Owner-directed; the plumbing is buildable + testable now, unknowns isolated. |
| Wait for a MITM capture before any code | Rejected | The capture only affects two seams; no reason to block the rest. |
| Web-portal scrape first | Deferred | Research's other proven path; kept selectable (`ecourts-web`, NotImplemented) as a fallback. |

## Related

- [ADR-0002](0002-source-agnostic-court-data-interface.md), [ADR-0004](0004-extract-from-ecourts-mobile-app.md)
- **[Runbook: capture, codec, and go-live](../runbooks/ecourts-mitm-and-codec.md)** — the steps to
  turn this provisional adapter into a working source.
- [`../ecourts-integration.md`](../ecourts-integration.md),
  [APK teardown](../research/2026-06-05-ecourts-apk-teardown.md),
  [open questions](../open-questions.md#ecourts-integration)
