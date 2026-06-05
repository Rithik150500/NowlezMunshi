# NowLez — WhatsApp Channel

A lightweight Munshi channel ([docs/interfaces.md#whatsapp](../../docs/interfaces.md#whatsapp),
[ADR-0013](../../docs/decisions/0013-whatsapp-channel.md)). The pieces live in:

- [`@nowlez/whatsapp`](../../packages/whatsapp) — the `WhatsAppClient` (Meta Cloud API + a
  fake) and inbound webhook parsing / verification.
- [`@nowlez/server`](../server) — serves the webhook routes (`GET`/`POST /whatsapp`): a
  verified inbound text is routed to the Munshi and the cited reply is sent back.

Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, and `WHATSAPP_VERIFY_TOKEN` (see
[`.env.example`](../../.env.example)) and point your Meta webhook at `/whatsapp`.

> Inbound routing is minimal (text → Munshi) for now; CNR lookups, alert/PDF delivery, media,
> and webhook signature verification are still to come.
