import type { WhatsAppClient } from "@nowlez/contracts";

/** Records sent messages instead of calling WhatsApp — for dev and tests. */
export class FakeWhatsAppClient implements WhatsAppClient {
  readonly id = "fake";
  readonly sent: { to: string; text: string }[] = [];

  async sendMessage(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
}
