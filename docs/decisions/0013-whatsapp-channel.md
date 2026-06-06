# ADR-0013 — WhatsApp channel (Meta Cloud API)

**Status:** Accepted (Phase 7)

## Context

NowLez exposes a lightweight **WhatsApp** surface ([interfaces.md](../interfaces.md#whatsapp)):
the Munshi by chat, case lookups, alerts, and the cause-list PDF. WhatsApp messaging is
provider-specific (the **Meta WhatsApp Cloud API**), and credentials must stay out of the repo.

## Decision

A **`WhatsAppClient` port** (in [`@nowlez/contracts`](../../packages/contracts/src/whatsapp.ts))
for sending messages, with adapters in [`@nowlez/whatsapp`](../../packages/whatsapp):

- **`FakeWhatsAppClient`** — records sent messages (tests).
- **`MetaWhatsAppClient`** — env-driven (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`).
- Inbound **`parseInboundMessage`** + GET **`verifyWebhook`** helpers also live there.

The inbound **webhook routes** are served by the [HTTP API](0011-http-api-hono.md)
([`apps/server`](../../apps/server)): `GET /whatsapp` verifies the subscription; `POST /whatsapp`
routes a verified inbound text to the Munshi and sends the cited reply back via the `WhatsAppClient`.

## Consequences

- Real WhatsApp send via Meta, credentials **from the environment** (never committed); tests
  and CI use the fake (no network).
- The webhook **reuses the existing HTTP API** rather than a second server; same
  swap-behind-a-port discipline as the other integrations.
- Inbound routing parses a **command set** (`case`/`orders`/`cause-list`/`help`, a bare CNR;
  anything else → Munshi) via `parseWhatsAppCommand` + the server's `handleWhatsAppText`. **Media
  delivery** (order + cause-list PDFs, needs the Meta media API) and webhook **signature
  verification** remain open.

## Related

- [`../interfaces.md`](../interfaces.md#whatsapp), [ADR-0011](0011-http-api-hono.md),
  [open questions](../open-questions.md#interfaces)
