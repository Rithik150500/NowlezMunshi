# @nowlez/tracking

The **daily-refresh / alert engine**
([docs/alerts-and-tracking.md](../../docs/alerts-and-tracking.md)).

- **`diffCase(previous, latest)`** — pure diff of two case snapshots, applying the
  **alert-worthy catalogue**: **new orders** and changes to the **next-hearing date** or
  **status** (incl. a disposal) raise alerts; other watched detail fields update **silently**.
- **`TrackingService`** — `refresh(cnr)` re-fetches a tracked case through the
  [`CourtDataSource`](../court-data), diffs it against the stored snapshot
  ([`CaseRepository`](../persistence)), persists the latest, and returns the
  changes plus the alert-worthy ones as `Alert`s. `refreshAll()` is the daily cycle and
  **skips disposed cases** (`caseLifecycle`).
- **`buildHearingDigest(cases, { today?, horizonDays? })`** — the
  [*never miss a hearing*](../../docs/alerts-and-tracking.md#never-miss-a-hearing) digest: a pure
  read that buckets tracked, active cases (**overdue / today / tomorrow / this week / later /
  unscheduled**) relative to *today*, so upcoming and overdue hearings surface without an eCourts call.

**Scope (now):** single-tenant and testable against the mock. **Fetch-once /
fan-out** to every user tracking a case, the notification **delivery channels**,
and the **scheduling** of the daily cycle await the auth/tenancy model and a
deployment target — all tracked in [open questions](../../docs/open-questions.md).
This is the engine the Phase-6 alert system builds on.
