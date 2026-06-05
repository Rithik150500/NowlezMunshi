# @nowlez/tracking

The **daily-refresh / alert engine**
([docs/alerts-and-tracking.md](../../docs/alerts-and-tracking.md)).

- **`diffCase(previous, latest)`** — pure diff of two case snapshots. **New orders**
  are alert-worthy; changes to watched detail fields are **silent** updates. (The
  spec commits only to "new orders are alert-worthy"; the full catalogue is an
  [open question](../../docs/open-questions.md#alerts--tracking).)
- **`TrackingService`** — `refresh(cnr)` re-fetches a tracked case through the
  [`CourtDataSource`](../court-data), diffs it against the stored snapshot
  ([`CaseRepository`](../persistence)), persists the latest, and returns the
  changes plus the alert-worthy ones as `Alert`s. `refreshAll()` is the daily cycle.

**Scope (now):** single-tenant and testable against the mock. **Fetch-once /
fan-out** to every user tracking a case, the notification **delivery channels**,
and the **scheduling** of the daily cycle await the auth/tenancy model and a
deployment target — all tracked in [open questions](../../docs/open-questions.md).
This is the engine the Phase-6 alert system builds on.
