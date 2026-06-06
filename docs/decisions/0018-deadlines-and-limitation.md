# ADR-0018 — Deadlines as a local entity; a provisional limitation catalogue

**Status:** Accepted (Phase 7, v2)

## Context

Limitation periods are load-bearing in litigation — an appeal filed a day late can be barred. The
product must let an advocate record and compute these **deadlines** ([docs/deadlines.md](../deadlines.md)),
which raises two questions: where deadlines sit relative to the CNR-keyed
[Case](0001-cnr-as-sole-primary-key.md), and how much **legal content** (the actual limitation
periods) the codebase should assert.

## Decision

1. **Deadline is a NowLez-local entity**, exactly like a [Client](0017-clients-local-entity.md): its
   own `DeadlineId`, stored behind a **`DeadlineStore`** port (in-memory + file adapters), referencing
   its case by **CNR** but never altering the case record. A case stays keyed solely by its CNR.
2. **The limitation calculator is pure date math** (`addDays`, `computeLimitationDeadline`) over a
   small **`LIMITATION_RULES` catalogue** that is **explicitly PROVISIONAL** — illustrative periods,
   not legal advice. It is one editable table, isolated in
   [`@nowlez/tracking`](../../packages/tracking/src/deadlines.ts), so a lawyer's confirmed periods
   (and their triggers/exclusions) drop in without code changes elsewhere.
3. **Deadlines surface like hearings** — `buildDeadlineDigest` mirrors the hearing digest, so the
   "never miss a deadline" view reuses the established bucketing.

## Consequences

- **No change to case identity** (ADR-0001 holds); deadlines are additive overlay data, removable
  without touching case records.
- **Zero new infrastructure** — another adapter behind a port; the in-memory default keeps CI green.
- The **legal risk is contained and visible**: the periods live in one flagged table, never presented
  as authoritative. Real-world use is gated on legal sign-off — tracked in
  [open questions](../open-questions.md#data-model).
- The **hearing-prep brief** is just a Munshi prompt (`hearingPrepMessage`) over the existing run
  loop, so citation discipline and tools apply unchanged.

## Related

- [ADR-0001](0001-cnr-as-sole-primary-key.md), [ADR-0007](0007-persistence-port.md),
  [ADR-0017](0017-clients-local-entity.md) (the same local-entity pattern).
- [`../deadlines.md`](../deadlines.md), [`../data-model.md`](../data-model.md).
