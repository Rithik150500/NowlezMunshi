# @nowlez/case-management

**Stub.** How a case enters NowLez and stays current — adding by CNR/QR, search,
daily-cycle tracking, and cause-list cross-referencing
([docs/case-management.md](../../docs/case-management.md)).

Every feature is powered by an injected
[`CourtDataSource`](../contracts/src/court-data-source.ts)
([ADR-0002](../../docs/decisions/0002-source-agnostic-court-data-interface.md)) —
by default the mock from [`@nowlez/court-data`](../court-data). Behaviour lands
from **Phase 2** (add-case-by-CNR) onward; until then the methods throw
`NotImplementedError`.
