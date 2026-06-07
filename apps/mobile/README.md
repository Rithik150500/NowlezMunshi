# NowLez — Mobile App (`@nowlez/mobile`)

The phone application, organised under two tabs — **CASES** and **MUNSHI**
([docs/interfaces.md#mobile-application](../../docs/interfaces.md#mobile-application)).

## What's here (the data layer)

This package is the mobile app's **framework-agnostic data layer** over the
[HTTP API](../server) ([ADR-0011](../../docs/decisions/0011-http-api-hono.md)):

- **`NowlezClient`** (`src/client.ts`) — a typed client with an **injectable transport**
  (`fetch`), so it is fully unit-tested with no network and runs unchanged under React Native.
  Point `baseUrl` at the server (e.g. `https://api.example`); on web it defaults to the `/api`
  proxy.
- **`createMobileApp()`** (`src/index.ts`) — groups the client into a login gate + the two tabs the
  spec names: `auth` (the three sign-in methods + session lifecycle — see below), `cases` (caseload,
  add, tracking, alerts, cause list, search, file download), and `munshi` (ask, with the cited reply
  + tool-call trace).
- **Auth (ADR-0019):** `NowlezClient` holds the bearer token and attaches it to every request; the
  session-issuing calls (`register` / `loginWithPassword` / `verifyOtp` / `loginWithGoogle`) store
  it, `logout()` clears it, and a token can be restored on launch via the `token` option.

Keeping the data layer free of the RN runtime is deliberate: it is typechecked (`pnpm run
typecheck`) and tested (`pnpm test`) in CI, where a React Native / Metro toolchain can't run.

## The remaining piece (the RN shell)

A thin **React Native** shell renders `createMobileApp()`:

- **Login gate** → `app.auth.*`: email + password, phone OTP (two-step), Google (device sign-in →
  ID token), and firm sign-up; persist `app.auth.token()` to start authenticated next launch.
- **CASES** tab → a `FlatList` of cases (expandable to orders/files), the alerts and cause-list
  views, the add/upload actions, and case detail.
- **MUNSHI** tab → the chat: message, the **tool-call trace** + cited **response**, and any draft
  document, with a composer (**+ Files**, voice).

The shell wires UI events to `app.cases.*` / `app.munshi.ask(...)` — no business logic lives in
it. The RN framework choice itself is an
[open question](../../docs/open-questions.md#stack--platform); Expo + React Native keeps it in the
TypeScript stack ([ADR-0006](../../docs/decisions/0006-typescript-monorepo-stack.md)).
