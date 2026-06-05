# ADR-0004 — Extract court data from the eCourts mobile-app backend

**Status:** Accepted (agreed in specification)

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

## Related

- [`../ecourts-integration.md`](../ecourts-integration.md)
- [ADR-0002](0002-source-agnostic-court-data-interface.md)
