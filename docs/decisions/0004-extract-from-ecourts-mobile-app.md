# ADR-0004 — Extract court data from the eCourts mobile-app backend

**Status:** Accepted (agreed in specification) — **premise under empirical review** (see the
[Research update](#research-update-2026-06-05) below)

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

## Related

- [`../ecourts-integration.md`](../ecourts-integration.md)
- [Research report (2026-06-05)](../research/2026-06-05-ecourts-gemma-landscape.md)
- [ADR-0002](0002-source-agnostic-court-data-interface.md)
