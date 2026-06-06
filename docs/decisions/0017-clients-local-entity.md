# ADR-0017 — Client is a NowLez-local entity; a Case stays CNR-keyed

**Status:** Accepted (Phase 7, v2)

## Context

An advocate's cases belong to **clients**, and the product needs to group cases by client and send
clients updates ([docs/clients.md](../clients.md)). But [ADR-0001](0001-cnr-as-sole-primary-key.md)
makes the **CNR the sole primary key** of a Case, and the data model is otherwise eCourts-derived.
Introducing clients must not erode that: a client is a relationship the *advocate* maintains, with no
counterpart in eCourts, so it cannot become part of a case's identity.

## Decision

Model **Client** as a **NowLez-local entity** with its own generated `ClientId`, stored behind a
**`ClientRepository`** port (in-memory + file adapters, the same pattern as `CaseRepository` /
`AlertStore`). Link a case to a client with an **optional `clientId` attribute on the Case** — a
*local* field, exactly like the `tracking` flag — rather than a new key or a foreign entity owning
the case.

- A Case is still **keyed solely by its CNR**; `clientId` is additive and nullable.
- One client holds **many** cases; a case has **at most one** client.
- Client CRUD + assignment live in a **`ClientService`**
  ([`@nowlez/case-management`](../../packages/case-management)); the client-facing **update** is
  composed by `buildClientUpdate` ([`@nowlez/tracking`](../../packages/tracking)) from the existing
  hearing digest + alert feed.

## Consequences

- **No change to case identity or the eCourts boundary.** Clients are a pure overlay; a case with no
  client behaves exactly as before. Removing the feature would not touch case data.
- **Zero new infrastructure** — the client store is another adapter behind a port; CI stays green on
  the in-memory default.
- The **CNR-only boundary holds**: matters with no CNR are still out of scope (ADR-0001); a client
  simply *groups* CNR-keyed cases.
- **Deferred:** multi-advocate ownership of clients, a client-facing portal/login, and per-client
  notification preferences all wait on the [auth/tenancy model](../open-questions.md#data-model).

## Related

- [ADR-0001](0001-cnr-as-sole-primary-key.md) (CNR as sole key),
  [ADR-0007](0007-persistence-port.md) (repository ports),
  [ADR-0015](0015-alert-store-and-delivery.md) (the alerts a client update draws on).
- [`../clients.md`](../clients.md), [`../data-model.md`](../data-model.md).
