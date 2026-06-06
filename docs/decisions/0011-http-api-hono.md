# ADR-0011 — HTTP API with Hono

**Status:** Accepted (Phase 7)

## Context

The three [front-ends](../interfaces.md) (web, mobile, WhatsApp) all sit on the **same
engine** and need a transport to reach it. The engine is a set of TypeScript services
(`CaseManagement`, `TrackingService`, `Munshi`); exposing them over HTTP is the natural seam.

## Decision

Expose the engine as an **HTTP API** ([`apps/server`](../../apps/server)) built with **Hono**
+ **@hono/node-server**. Hono is tiny and standards-based (Web Fetch `Request`/`Response`), and
its `app.request()` makes every route **testable without opening a socket**. `createApp(engine)`
builds the app over a wired `ServerEngine`; `buildServerEngine()` is the composition root (the
same wiring as the CLI — mock source, durable file store, offline-stub-or-real model, web search).

Routes: `/health`, `GET`/`POST /cases`, `GET /cases/:cnr`, `POST /cases/:cnr/tracking`,
`GET /cause-list`, `POST /refresh`, `POST /munshi`.

## Consequences

- **One transport unblocks all three front-ends**; the engine stays transport-agnostic.
- Routes are tested via `app.request()` (no network); the server runs on Node via
  `@hono/node-server` (`pnpm server`).
- Auth / tenancy, request validation, and richer error mapping are **minimal for now** and
  tracked in [open questions](../open-questions.md).

## Related

- [`../interfaces.md`](../interfaces.md), [ADR-0006](0006-typescript-monorepo-stack.md),
  [roadmap Phase 7](../roadmap.md#phase-7--front-ends)
