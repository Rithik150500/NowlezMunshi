# ADR-0004 — Extract court data from the eCourts mobile-app backend

**Status:** Accepted — **mobile-app backend reaffirmed as primary** (2026-06-06). Premise validated by
the static teardown (CAPTCHA-free, attestation-free; gated by client-side request encryption); legal /
compliance sign-off is a **go-live gate**, not a source change. See the
[reaffirmation](#decision-reaffirmed-2026-06-06) and the dated updates below.

## Context

eCourts exposes **no official API**, yet NowLez needs **case data, order PDFs, and cause
lists**. Three acquisition routes were available.

## Decision

Obtain court data by **extracting it from the backend of the official eCourts Services
_mobile app_**, as the **primary** implementation behind the
[`CourtDataSource` interface](0002-source-agnostic-court-data-interface.md). Because that
backend is **undocumented**, the integration is built by **reverse-engineering the app —
decompiling it**.

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Scrape the public eCourts **web portal** | Fallback only | Deliberately guarded by **CAPTCHAs** that resist automation. |
| Buy from a **commercial third-party** data provider | Fallback only | Added cost and dependency; kept as a swappable fallback. |
| **eCourts Services mobile-app backend** | **Chosen (primary)** | Its API is **not CAPTCHA-guarded**, unlike the web portal. |

## Consequences

- **Automatable primary source.** No CAPTCHA wall on the critical path.
- **Fragility, contained.** An undocumented backend can change or lock down without notice.
  The [source-agnostic interface](0002-source-agnostic-court-data-interface.md) confines this
  risk to a single implementation, and the
  [operational discipline](../ecourts-integration.md#operational-discipline) (rate-limiting,
  caching, fetch-once/fan-out) reduces the chance of being blocked.
- **Defined failover.** If the backend changes, locks down, or comes to require
  **device-integrity attestation** an automated client cannot satisfy, NowLez switches to the
  web-portal scrape or a commercial API by **flipping one selector**.

## Risks

- **Attestation.** The mobile backend may require device-integrity attestation — the spec
  names this as the key trigger for falling back. Needs investigation
  ([open questions](../open-questions.md#ecourts-integration)).
- **Legal / ToS / compliance.** Reverse-engineering and automated extraction warrant a
  compliance review; tracked in [open questions](../open-questions.md#ecourts-integration).

## Research update (2026-06-05)

A fact-checked [research report](../research/2026-06-05-ecourts-gemma-landscape.md) (3-vote
adversarial verification) tested this ADR's load-bearing premise and found it **unsubstantiated by
any public source**:

- **No public teardown of the eCourts Services Android app's native API exists**, and there is **no
  public evidence either way** about device-integrity attestation (Play Integrity / SafetyNet) on it.
  The claim *"the mobile app's API is not CAPTCHA-guarded"* is therefore a **hypothesis, not an
  established fact** (all three verifiers marked the negative UNCERTAIN — a negative cannot be proven).
- **The proven path is the web portal.** Every actively-maintained open-source eCourts tool
  (`openjustice-in/ecourts`, `iamshouvikmitra/bharat-courts`) and every commercial "eCourts API"
  (`ecourtsindia.com`, Surepass, AuthBridge, Apify, Kleopatra) scrapes the **public web portal** and
  defeats its image **CAPTCHA with OCR** — none use an un-CAPTCHA'd mobile API.
- **No self-serve official API.** Official APIs (NAPIX, NJDG, Kerala DigiCourt) exist but are gated to
  government / law-enforcement / authorized partners — not available to a private product.
- **Legal exposure** (§43 IT Act 2000, DPDP, eCourts ToS) is real and unsettled, independent of the
  low technical barrier.

**Consequence — reframing, not reversal.** Keeping the source behind the
[`CourtDataSource` interface](0002-source-agnostic-court-data-interface.md) is *reinforced*, but the
**default proven implementation should be the web-portal scrape (with CAPTCHA-OCR)**; the mobile-app
backend remains a **hypothesis to validate empirically** — decompile / MITM-proxy the current APK
(`in.gov.ecourts.eCourtsServices`) and confirm whether its API is genuinely CAPTCHA-free and
attestation-free **before** committing to it as primary. Until validated, treat "mobile-app primary"
as aspirational. See the elevated items in
[open questions](../open-questions.md#ecourts-integration).

## APK teardown (2026-06-05)

A [static teardown of the eCourts Services APK](../research/2026-06-05-ecourts-apk-teardown.md)
(v4.0.1) provides the first-hand evidence the [Research update](#research-update-2026-06-05) lacked,
and **substantially validates this decision's premise**:

- The app (React Native / Hermes) calls a **distinct mobile backend** —
  `app.ecourts.gov.in/services_DC_4.0/…` and `…/services_HC_4.0/…`, **separate from** the
  CAPTCHA-guarded web portal — with an endpoint surface matching NowLez's needs (party/case/advocate/
  FIR search, case history, cause lists, order PDFs).
- That backend is **CAPTCHA-free** (no captcha artifacts in the bundle) and uses **no device-integrity
  attestation** (no Play Integrity / SafetyNet in dex, manifest, or native libs).
- The barrier is instead **client-side request-parameter encryption** (crypto-js AES, hardcoded key +
  generated IV) — extractable but **brittle** (can rotate per release) and an access-control measure
  that **raises the legal stakes**. Client-side **RootBeer** root/emulator checks and **TLS pinning**
  are app-side only and do not impede a headless server-to-server client.

**Net:** "mobile API as a non-CAPTCHA path" is now **evidence-backed**, but the practical choice stays
nuanced. Recommendation: keep both implementations behind the interface; **default to the web-portal
scrape** to start (lower legal sensitivity, public tooling exists); pursue the **mobile API only with
legal sign-off** and a **dynamic MITM capture** to confirm the exact request format. The mobile path's
barrier is a **replicable client-side crypto scheme**, not a CAPTCHA or attestation.

## Decision reaffirmed (2026-06-06)

Weighing the analysis above, the product **keeps the eCourts mobile-app backend as the primary
source**. The teardown validated the technical premise (CAPTCHA-free, attestation-free); the only
remaining barrier is **legal / compliance**, handled as a **go-live gate** — the real request-param
codec, a dynamic MITM capture to confirm wire shapes, and legal sign-off **before any live traffic** —
not a change of primary source. The interim *"default to the web-portal scrape"* recommendation in the
two update sections above is **superseded for the product decision**; the web-portal scrape and a
commercial API remain selectable fallbacks behind the same
[`CourtDataSource`](0002-source-agnostic-court-data-interface.md) seam. The dated
[research reports](../research/) are left intact as the analysis that informed this.

## Related

- [`../ecourts-integration.md`](../ecourts-integration.md)
- [APK teardown (2026-06-05)](../research/2026-06-05-ecourts-apk-teardown.md)
- [Research report (2026-06-05)](../research/2026-06-05-ecourts-gemma-landscape.md)
- [ADR-0002](0002-source-agnostic-court-data-interface.md)
