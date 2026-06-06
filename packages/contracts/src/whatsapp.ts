/**
 * The WhatsApp channel client (docs/interfaces.md#whatsapp, ADR-0013). Sends a
 * text message or a document (e.g. a drafted/uploaded file) to a recipient;
 * adapters live in @nowlez/whatsapp (a fake for tests and a Meta Cloud API
 * client). The inbound webhook is served by the HTTP API (apps/server).
 */
export interface OutboundDocument {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly caption?: string;
}

export interface WhatsAppClient {
  /** Which implementation this is (e.g. "fake", "meta"). */
  readonly id: string;
  sendMessage(to: string, text: string): Promise<void>;
  /** Send a document as WhatsApp media (the Meta path uploads, then sends by media id). */
  sendDocument(to: string, document: OutboundDocument): Promise<void>;
}
