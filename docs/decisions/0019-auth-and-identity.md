# ADR-0019 — Authentication & identity: firm tenant, three methods behind ports

**Status:** Accepted (Phase 7, v2) — **core landed; server wiring + tenant-scoping follow**

## Context

NowLez has been single-tenant and unauthenticated: `User` was a stub and all data was global. Three
things are explicitly deferred *waiting on identity*: per-user notification preferences,
multi-recipient routing, and [fetch-once / fan-out](../alerts-and-tracking.md#fetch-once-fan-out).
The product also spans **three surfaces** (web, mobile, WhatsApp), and WhatsApp's identity is
inherently a phone number.

## Decision

1. **The tenant is the Firm** (a solo advocate is a firm of one). A **User** belongs to one firm with
   a **Role** (`principal` / `associate` / `clerk`). `User` is expanded from a stub; `Firm` is new
   ([`identity.ts`](../../packages/contracts/src/identity.ts)).
2. **Three sign-in methods behind one `AuthService`** ([`@nowlez/auth`](../../packages/auth)):
   **phone OTP** (over an `OtpSender` — WhatsApp/SMS), **email + password** (Node `scrypt`, no native
   dep), and **Google sign-in** (a `GoogleVerifier` checks the client-obtained ID token). The phone
   unifies identity across all three surfaces.
3. **Everything external is a port with an offline fake** (`OtpSender`/`FakeOtpSender`,
   `GoogleVerifier`/`FakeGoogleVerifier`), and `UserRepository` / `FirmRepository` / `SessionStore`
   get in-memory + file adapters in [`@nowlez/persistence`](../../packages/persistence) — same
   pattern as every other store, so CI stays green offline and the real OTP/Google adapters wire at
   the composition root.
4. **Sessions are opaque bearer tokens** in a `SessionStore` (revocable, with an expiry), not
   stateless JWTs — simpler to reason about and to revoke for an MVP.

## Consequences

- A **tested identity/auth engine** lands first (the core), decoupled from the request layer —
  consistent with the seam-first pattern (ports before adapters; data layer before UI).
- It **unblocks** the deferred per-user prefs, multi-recipient routing, and fan-out, and gives the
  Munshi context a tenant to scope to (closing the cross-tenant-leakage open question) — in 6b.
- **Still to do (follow-ups):** server `/auth` routes + middleware that resolves the bearer token to
  a principal; **per-tenant scoping** of every repository/query (6b); RBAC enforcement; the web /
  mobile login + signup UIs; and the shared-case / per-firm-overlay split + fan-out (a later ADR).
- **Security:** scrypt for passwords, OTP expiry + no phone-enumeration, opaque revocable tokens.
  Production hardening (OTP rate-limiting, cookie/CSRF for the web, secret management) is tracked in
  [open questions](../open-questions.md#data-model).

## Related

- [ADR-0007](0007-persistence-port.md) (repository ports), [ADR-0013](0013-whatsapp-channel.md)
  (the OTP delivery channel), [ADR-0017](0017-clients-local-entity.md) /
  [ADR-0018](0018-deadlines-and-limitation.md) (the local-entity pattern).
- [`../auth.md`](../auth.md), [`../data-model.md`](../data-model.md).
