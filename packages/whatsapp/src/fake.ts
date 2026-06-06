import type { OutboundDocument, WhatsAppClient } from "@nowlez/contracts";

/** Records sent messages/documents instead of calling WhatsApp — for dev and tests. */
export class FakeWhatsAppClient implements WhatsAppClient {
  readonly id = "fake";
  readonly sent: { to: string; text: string }[] = [];
  readonly documents: { to: string; document: OutboundDocument }[] = [];

  async sendMessage(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  async sendDocument(to: string, document: OutboundDocument): Promise<void> {
    this.documents.push({ to, document });
  }
}
