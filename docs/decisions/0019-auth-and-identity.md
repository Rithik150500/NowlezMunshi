# ADR-0019 — Authentication & identity: firm tenant, three methods behind ports

**Status:** Accepted (Phase 7, v2) — **core + server `/auth` + tenant-scoping (6b) + login UIs (6-ui) + RBAC landed**

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
- It **unblocks** the deferred per-user prefs, multi-recipient routing, and fan-out, and scopes the
  Munshi context to the request's firm (6b — closing the cross-tenant-leakage open question).
- **Server `/auth` is wired** — `register` / `login` / `google` / `otp` / `me` / `logout` + a
  bearer middleware that resolves the principal onto the request context (OTP over WhatsApp + Google
  tokeninfo by env, else fakes).
- **Tenant-scoping (6b) landed:** `engine.forFirm(firmId)` gives each firm fully isolated case /
  client / deadline / alert stores + Munshi handlers; `NOWLEZ_REQUIRE_AUTH` enforces auth on the
  firm-owned routes; and every route, the Munshi context, the refresh cycle, and the WhatsApp channel
  resolve the request's firm (the principal's `firmId`, else a default firm for dev) — isolation-tested
  end-to-end through the API. The scheduler fans the daily refresh across every firm.
- **Login UIs (6-ui) landed:** the web app has a login/signup gate (all three methods + a
  bearer-token client that drops back to login on a 401), and the mobile data layer (`NowlezClient`)
  gains the same token-bearing auth surface, exposed to the RN shell and tested.
- **RBAC landed:** a pure, hierarchical role→permission policy (`can` / `ROLE_PERMISSIONS` in
  `@nowlez/auth`, tested) — clerk ⊂ associate ⊂ principal — applied as a server route guard on the
  role-sensitive routes (client notify, record delete); the default-firm dev path stays open. The
  role's permissions ride on the session + `/auth/me`, so the web hides actions a role can't perform.
- **Hardening landed:** rate-limiting (`RateLimiter`, tested) on OTP requests (per phone, before the
  lookup — no enumeration / bombing) and failed password sign-ins (per email; a success clears it),
  both surfaced as HTTP 429. Process-local for now (a shared store is a later port).
- **Still to do (follow-ups):** web cookie/CSRF (revisits the bearer-token choice below); the RN
  shell screens; and the shared-case / per-firm-overlay split + fan-out (a later ADR).
- **Security:** scrypt for passwords, OTP expiry + no phone-enumeration, opaque revocable tokens, and
  rate-limiting on the OTP/login paths. Remaining hardening (cookie/CSRF for the web, secret
  management) is tracked in [open questions](../open-questions.md#data-model).

## Related

- [ADR-0007](0007-persistence-port.md) (repository ports), [ADR-0013](0013-whatsapp-channel.md)
  (the OTP delivery channel), [ADR-0017](0017-clients-local-entity.md) /
  [ADR-0018](0018-deadlines-and-limitation.md) (the local-entity pattern).
- [`../auth.md`](../auth.md), [`../data-model.md`](../data-model.md).
