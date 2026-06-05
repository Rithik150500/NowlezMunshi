# @nowlez/court-data

Implementations of the source-agnostic
[`CourtDataSource`](../contracts/src/court-data-source.ts) interface
([ADR-0002](../../docs/decisions/0002-source-agnostic-court-data-interface.md)),
plus the **single source selector** that everything in NowLez goes through.

## The point of this package

The rest of NowLez — the Munshi, ingestion, the alert engine — never knows where
court data comes from. It calls `selectCourtDataSource()` and gets *an*
implementation. Switching from the mock to a real eCourts source (or between real
sources) is changing one argument and nothing else.

```ts
import { selectCourtDataSource } from "@nowlez/court-data";

const courts = selectCourtDataSource();        // "mock" by default in Phase 1
const c = await courts.getCaseByCnr(myCnr);     // add-a-case by CNR
```

## What's here in Phase 1

- **`MockCourtDataSource`** — a deterministic, network-free implementation seeded
  with one sample case, so the Phase-2 slice and the test suite run with **no real
  eCourts calls**.
- **`selectCourtDataSource(id?)`** — the selector. `"mock"` works today;
  `"ecourts-mobile"`, `"ecourts-web"`, and `"commercial"` throw
  `NotImplementedError` until **Phase 6**
  ([ecourts-integration](../../docs/ecourts-integration.md)).
