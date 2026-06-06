# ADR-0015 — Alert persistence behind an AlertStore port (+ delivery)

**Status:** Accepted (Phase 6)

## Context

The [tracking engine](../alerts-and-tracking.md) ([`@nowlez/tracking`](../../packages/tracking))
already diffs a re-fetched case against the stored snapshot and produces **Alerts** for the
alert-worthy changes. But those alerts were **returned and discarded** — never stored, never
delivered — so there was no alert feed to read, no read/unread state, and no notification. The
spec calls for [notifications and an alerts view](../alerts-and-tracking.md); per-channel
preferences and multi-tenant fan-out remain [open](../open-questions.md#alerts--tracking).

## Decision

An **`AlertStore` port** (in [`@nowlez/contracts`](../../packages/contracts/src/alert-store.ts)):
`save(alerts)` (upsert by id, returns the newly-added ones), `list()` (newest first), and
`markRead(id)`. Adapters live in [`@nowlez/persistence`](../../packages/persistence) alongside the
`CaseRepository` ([ADR-0007](0007-persistence-port.md)):

- **`InMemoryAlertStore`** — the default; process-lifetime store for dev and tests.
- **`FileAlertStore`** — durable, dependency-free JSON file store for the MVP.
- **`selectAlertStore(kind, opts)`** — the single selector.

Alerts carry a **stable id** (seeded from the change), so `save` is idempotent — re-running the
daily refresh never duplicates an alert or resets its read state.

**Delivery** is orchestrated at the composition root, not in the tracking engine:
- The [HTTP API](0011-http-api-hono.md) `POST /refresh` persists the refresh's alerts and serves
  the feed (`GET /alerts`, `POST /alerts/:id/read`); the [web app](../interfaces.md#web-application)
  renders it. This is the always-on delivery channel.
- A **`Notifier`** (`apps/server/src/notifier.ts`) then pushes to outside channels per
  **single-tenant preferences** (`NOWLEZ_PUSH_ALERTS` / `NOWLEZ_ALERT_KINDS` /
  `NOWLEZ_DAILY_BRIEFING`): the new alert-worthy changes, and an opt-in **daily briefing**
  (imminent hearings + unread alerts — `buildDailyBriefing`, also at `GET /briefing`) — over the
  configured WhatsApp number (`WHATSAPP_ALERT_RECIPIENT`) via the
  [`WhatsAppClient`](0013-whatsapp-channel.md). The preferences object is the single-tenant seam;
  **per-user** preferences and **multi-recipient** routing await the auth/tenancy model.

## Consequences

- **Durable, de-duplicated alerts today** with **zero new dependencies**; CI stays green on the
  in-memory default — same seam discipline as the `CaseRepository` / `BlobStore`.
- The tracking engine stays **pure** (diff → alerts); persistence and delivery are wired at the
  edges, so a SQLite store or a push/email channel is a new adapter, not a rewrite.
- Open: **per-user** preferences + **multi-recipient routing**, **multi-tenant fan-out**
  ([fetch-once / fan-out](../alerts-and-tracking.md#fetch-once-fan-out)), and **scheduling** the
  daily cycle (a deployment concern) — [open questions](../open-questions.md#alerts--tracking).

## Related

- [ADR-0007](0007-persistence-port.md), [ADR-0011](0011-http-api-hono.md),
  [ADR-0013](0013-whatsapp-channel.md)
- [`../alerts-and-tracking.md`](../alerts-and-tracking.md),
  [open questions](../open-questions.md#alerts--tracking)
