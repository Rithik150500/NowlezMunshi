/**
 * The WhatsApp channel client (docs/interfaces.md#whatsapp, ADR-0013). Sends a
 * message to a recipient; adapters live in @nowlez/whatsapp (a fake for tests and
 * a Meta Cloud API client). The inbound webhook is served by the HTTP API
 * (apps/server).
 */
export interface WhatsAppClient {
  /** Which implementation this is (e.g. "fake", "meta"). */
  readonly id: string;
  sendMessage(to: string, text: string): Promise<void>;
}
