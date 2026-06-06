# @nowlez/server

The NowLez **HTTP API** ([ADR-0011](../../docs/decisions/0011-http-api-hono.md)) — exposes the
engine over HTTP so the front-ends ([web](../web), [mobile](../mobile),
[WhatsApp](../whatsapp)) can sit on it. Built with [Hono](https://hono.dev).

```bash
pnpm server        # listens on http://localhost:3000 (override with PORT)
```

| Route | Does |
| --- | --- |
| `GET /health` | liveness |
| `GET /cases` · `POST /cases` `{cnr}` | list / add a case |
| `GET /cases/:cnr` | fetch a case |
| `POST /cases/:cnr/tracking` `{tracking}` | toggle tracking |
| `GET /cause-list?date=YYYY-MM-DD` | the day's cause list for tracked cases |
| `GET /hearings?today=&horizon=` | upcoming hearings across the caseload, bucketed |
| `GET /briefing?today=` | daily briefing: imminent hearings + unread alerts |
| `POST /refresh` | refresh tracked cases; returns changes + alerts |
| `POST /munshi` `{message}` | ask the Munshi; returns a cited response |
| `GET`/`POST /whatsapp` | WhatsApp webhook — verify (GET) + inbound text → Munshi → reply (POST) |

Same composition as the CLI: the mock court source + a durable file store under `.nowlez/`,
an offline-stub model until `NOWLEZ_MODEL_*` are set, and `TAVILY_API_KEY` for web search.
Routes are tested via `app.request()` — no socket, no network.
