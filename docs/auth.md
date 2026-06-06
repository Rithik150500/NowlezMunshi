# Authentication & identity

NowLez signs an advocate in across three surfaces (web, mobile, WhatsApp) and scopes their work to
their **firm**. This page describes the identity model and the authentication engine
([ADR-0019](decisions/0019-auth-and-identity.md)). The tested **core** is built; the server routes,
per-tenant scoping, and login UIs are the immediate follow-ups (noted below).

## Identity model

- **Firm** — the tenant. A solo advocate is simply a firm of one.
- **User** — a member of a firm with a **role** (`principal` / `associate` / `clerk`). A user carries
  optional login identifiers (`email`, `phone`) and credentials (`passwordHash`, `googleSub`), so the
  same account can use any of the methods below.

See [`identity.ts`](../packages/contracts/src/identity.ts) and
[data-model.md](data-model.md#user).

## Sign-in methods

All three sit behind one **`AuthService`** ([`@nowlez/auth`](../packages/auth)); each external piece
is a port with an offline fake, so CI is green without secrets.

| Method | How | Port |
| --- | --- | --- |
| **Phone OTP** | A 6-digit code is sent to the phone and verified; the phone unifies identity with the WhatsApp channel | `OtpSender` (real: WhatsApp/SMS; fake records) |
| **Email + password** | Password hashed with Node **`scrypt`** (no native dependency), verified in constant time | — (built in) |
| **Google sign-in** | The client completes the OAuth flow; the server **verifies the ID token** and links by `sub`/email | `GoogleVerifier` (real: Google tokeninfo; fake) |

**Registration** (`registerFirm`) creates a firm + its principal user (signup). The three login
methods authenticate an **existing** user and issue a **session** — an opaque bearer token in a
`SessionStore` (revocable, with an expiry).

## What's built vs. pending

- ✅ **Core** — the identity contracts, the `AuthService` (all three methods + register + session
  validate/logout), `scrypt` hashing, the `OtpSender` / `GoogleVerifier` fakes, and in-memory + file
  `UserRepository` / `FirmRepository` / `SessionStore` adapters, all tested.
- ⏳ **Server** — `/auth/*` routes + middleware that resolves the bearer token to a principal.
- ⏳ **Tenant-scoping (6b)** — thread `firmId` through every repository/query; scope the Munshi
  context (closing the cross-tenant-leakage [open question](open-questions.md#munshi)).
- ⏳ **UIs** — web / mobile login + signup; WhatsApp sender-phone → user.
- ⏳ **Fan-out** — the shared-case / per-firm-overlay split (a later ADR), which unblocks
  fetch-once/fan-out and per-user notification preferences.

## Security notes

scrypt password hashing; OTP expiry and **no phone-enumeration** (an unknown phone is silently not
sent a code); opaque, revocable session tokens. Production hardening — OTP **rate-limiting**, web
**cookie/CSRF**, and secret management — is tracked in [open questions](open-questions.md#data-model).

## See also

- [ADR-0019](decisions/0019-auth-and-identity.md) — the decision.
- [`data-model.md`](data-model.md) — Firm + User entities.
- [`alerts-and-tracking.md`](alerts-and-tracking.md#notifications) — the per-user prefs this unblocks.
