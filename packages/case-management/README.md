# @nowlez/case-management

How a case enters NowLez and stays current — adding by CNR/QR, search,
daily-cycle tracking, and cause-list cross-referencing
([docs/case-management.md](../../docs/case-management.md)).

Every feature is powered by an injected
[`CourtDataSource`](../contracts/src/court-data-source.ts)
([ADR-0002](../../docs/decisions/0002-source-agnostic-court-data-interface.md)) —
by default the mock from [`@nowlez/court-data`](../court-data).

## Status

- ✅ **Phase 2 — add-case-by-CNR (and by QR).** `addCaseByCnr` / `addCaseByQr` fetch
  through the source, map `FetchedCase → Case` (tracked, with raw orders), and record it
  in an **in-memory** store (`getCase` / `listCases` / `setTracking`). Persistence is an
  [open question](../../docs/open-questions.md#data-model), so the store is deliberately
  in-memory and swappable, and orders arrive raw — their page images and summary are filled
  later by [ingestion](../file-management) (Phase 3).
- ⏳ **Search** (`searchByParty` / `searchByCaseNumber`) and the **cause-list
  cross-reference** (`getCauseListForUser`) still throw `NotImplementedError`.
