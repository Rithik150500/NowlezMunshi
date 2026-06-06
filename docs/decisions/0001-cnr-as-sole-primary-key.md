# ADR-0001 — CNR is the sole primary key of a Case

**Status:** Accepted (agreed in specification)

## Context

A [Case](../data-model.md#case) is the central entity in NowLez. Every case registered in
[eCourts](../glossary.md#ecourts) carries a **[CNR](../glossary.md#cnr)** (Case Number
Record) — a unique, system-wide identifier. The product's scope is **District Courts and
High Courts**, both of which live entirely inside the eCourts/CNR system.

## Decision

A Case is keyed **solely by its CNR**. There is **no separate internal identifier**: every
case is keyed by, and referenced through, its CNR. [Orders](../data-model.md#order) and
[Files](../data-model.md#file) reference their parent case by its CNR.

## Consequences

- **Simplicity.** One natural key, used consistently across the data model, the
  [Munshi's citations](../munshi.md#citation-discipline), and the
  [court-data interface](0002-source-agnostic-court-data-interface.md). No id-mapping layer.
- **Scope boundary (by design).** Because a case cannot exist without a CNR, the product can
  represent **only cases eCourts has already registered**. A matter tracked **before** it
  has a CNR, or **any forum outside the eCourts/CNR system**, is **out of scope by design**.
  This is consistent with the DC/HC scope and is surfaced to users/builders rather than
  hidden — see [overview](../overview.md#scope-and-boundaries).
- **External key risk.** The primary key is owned by an external system. If eCourts ever
  reformatted or reissued CNRs, NowLez would be affected. Considered acceptable given CNRs
  are stable national identifiers.

## Alternatives considered

- **A separate internal surrogate key with CNR as a unique attribute.** Rejected per the
  specification: it adds an identifier with no benefit for this scope, and the CNR is already
  the universal reference everywhere else (citations, eCourts lookups, QR scans).

## Related

- [`../data-model.md`](../data-model.md)
- [`../overview.md#scope-and-boundaries`](../overview.md#scope-and-boundaries)
