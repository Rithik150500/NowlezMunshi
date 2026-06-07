# @nowlez/web

The NowLez **three-pane web app** (Vite + React) over the
[HTTP API](../server) — see [docs/interfaces.md](../../docs/interfaces.md#web-application).

- **Left** — the case list + add-by-CNR and refresh.
- **Middle** — the working area (viewer / editor / web viewer land with document handling).
- **Right** — the Munshi chat.

```bash
pnpm --filter @nowlez/web dev     # Vite dev server (proxies /api -> http://localhost:3000)
pnpm --filter @nowlez/web build   # production build (also typechecks)
```

Run the [API](../server) alongside it: `pnpm server`. This is an early shell — it talks to the
real engine over HTTP; styling and the viewer/editor are intentionally minimal for now.

**Sign in first.** The app opens on a login/signup screen ([ADR-0019](../../docs/auth.md)): create a
firm, or sign in with email + password, phone OTP, or Google. The bearer token is kept client-side
and sent on every request; a 401 returns you to login. Google needs `VITE_GOOGLE_CLIENT_ID` at build
time (see [`.env.example`](../../.env.example)); password and phone OTP work out of the box (the dev
OTP fake logs the code server-side).
