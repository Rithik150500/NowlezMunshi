# @nowlez/whatsapp

The **WhatsApp channel** ([ADR-0013](../../docs/decisions/0013-whatsapp-channel.md)) — a
lightweight Munshi surface ([docs/interfaces.md](../../docs/interfaces.md#whatsapp)).

| Piece | Does |
| --- | --- |
| `FakeWhatsAppClient` | Default; records sent messages (tests). |
| `MetaWhatsAppClient` | Sends via the Meta WhatsApp Cloud API. |
| `selectWhatsAppClient(kind)` | The selector; `"meta"` reads `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`. |
| `parseInboundMessage` / `verifyWebhook` | Parse inbound webhooks and answer the GET verification. |

The inbound **webhook routes** (`GET`/`POST /whatsapp`) are served by the
[HTTP API](../../apps/server): a verified inbound text is routed to the Munshi and the cited
reply is sent back. Credentials come from the environment, never committed; tests and CI use
the fake (no network).
