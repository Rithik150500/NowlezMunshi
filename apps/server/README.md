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
| `GET`/`POST /clients` · `GET /clients/:id` | list / create / fetch clients |
| `GET /clients/:id/cases` | the cases a client holds |
| `POST /cases/:cnr/client` `{clientId}` | assign a case to a client (omit to clear) |
| `GET /clients/:id/update` · `POST /clients/:id/notify` | compose / send a client update |
| `GET /limitation-rules` · `GET /deadlines` | the provisional limitation catalogue · the deadline digest |
| `GET`/`POST /cases/:cnr/deadlines` · `POST /deadlines/:id/done` · `DELETE /deadlines/:id` | a case's deadlines |
| `POST /cases/:cnr/prep-brief` | a Munshi hearing-prep brief for the case |
| `POST /refresh` | refresh tracked cases; returns changes + alerts |
| `POST /munshi` `{message}` | ask the Munshi; returns a cited response |
| `GET`/`POST /whatsapp` | WhatsApp webhook — verify (GET) + inbound text → Munshi → reply (POST) |

Same composition as the CLI: the mock court source + a durable file store under `.nowlez/`,
an offline-stub model until `NOWLEZ_MODEL_*` are set, and `TAVILY_API_KEY` for web search.
Routes are tested via `app.request()` — no socket, no network.
