# @nowlez/case-management

How a case enters NowLez and stays current — adding by CNR/QR, search,
daily-cycle tracking, cause-list cross-referencing, and **client management**
([docs/case-management.md](../../docs/case-management.md),
[clients.md](../../docs/clients.md)).

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
- ✅ **Search** (`searchByParty` / `searchByCaseNumber`) and the **cause-list
  cross-reference** (`getCauseListForUser`) run against the configured source.
- ✅ **Clients** — `ClientService` (create / list clients, `assignCase`, `listClientCases`) over a
  `ClientRepository`; a case links to a client via an optional `clientId` (CNR stays the sole key,
  [ADR-0017](../../docs/decisions/0017-clients-local-entity.md)).
