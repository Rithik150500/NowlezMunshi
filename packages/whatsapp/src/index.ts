/**
 * @nowlez/whatsapp — the WhatsApp channel (ADR-0013). A fake WhatsAppClient backs
 * dev and tests; the env-driven Meta client reaches the WhatsApp Cloud API. Inbound
 * webhook parsing + verification live here; the HTTP API (apps/server) serves the
 * webhook routes.
 */
export { parseWhatsAppCommand, type WhatsAppCommand } from "./commands";
export { FakeWhatsAppClient } from "./fake";
export { MetaWhatsAppClient, type MetaWhatsAppConfig } from "./meta";
export { selectWhatsAppClient, type WhatsAppKind } from "./select";
export { type InboundMessage, parseInboundMessage, verifyWebhook } from "./webhook";
