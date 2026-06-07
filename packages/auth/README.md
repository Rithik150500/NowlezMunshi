# @nowlez/auth

Authentication & identity ([docs/auth.md](../../docs/auth.md),
[ADR-0019](../../docs/decisions/0019-auth-and-identity.md)). One **`AuthService`** exposes the three
sign-in methods over ports; every external piece has an **offline fake**, so CI is green without
secrets.

- **`AuthService`** — `registerFirm` (signup: a firm + its principal user), `requestOtp` /
  `verifyOtp` (phone OTP), `loginWithPassword` (email + password), `loginWithGoogle` (verify the
  ID token, link by sub/email), and `validate` / `logout` over opaque session tokens.
- **`hashPassword` / `verifyPassword`** — Node **`scrypt`** (no native dependency), constant-time.
- **`FakeOtpSender`** / **`FakeGoogleVerifier`** — the offline adapters for the
  [`OtpSender`](../contracts/src/auth.ts) / [`GoogleVerifier`](../contracts/src/auth.ts) ports; the
  real ones (WhatsApp/SMS, Google tokeninfo) wire at the composition root.
- **`can` / `ROLE_PERMISSIONS` / `permissionsFor` / `Permission`** ([`authz.ts`](src/authz.ts)) — the
  RBAC policy: a pure, hierarchical role→permission table (clerk ⊂ associate ⊂ principal). It imports
  only the `Role` type, so any surface (server guard, web/mobile UI) can read it; `/auth/me` ships the
  role's permissions so the web hides what it can't do.
- **`RateLimiter` / `RateLimitError`** ([`rate-limit.ts`](src/rate-limit.ts)) — a per-key sliding
  window guarding the abuse-prone paths: OTP requests (per phone) and failed sign-ins (per email).
  Process-local for now; a shared store (Redis) for multi-instance is a later port.

Repositories (`UserRepository` / `FirmRepository` / `SessionStore`) live in
[`@nowlez/persistence`](../persistence) (in-memory + file). The tenant is the **firm** (a solo
advocate is a firm of one); the rest of the engine is per-firm scoped via `engine.forFirm` (6b).
