import type { WhatsAppClient } from "@nowlez/contracts";

export interface MetaWhatsAppConfig {
  readonly token: string;
  readonly phoneNumberId: string;
  /** Defaults to "https://graph.facebook.com/v21.0". */
  readonly baseUrl?: string;
  /** Injectable fetch for testing; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

/** The Meta WhatsApp Cloud API client. Config is supplied by `selectWhatsAppClient`. */
export class MetaWhatsAppClient implements WhatsAppClient {
  readonly id = "meta";

  constructor(private readonly config: MetaWhatsAppConfig) {}

  async sendMessage(to: string, text: string): Promise<void> {
    const base = this.config.baseUrl ?? "https://graph.facebook.com/v21.0";
    const doFetch = this.config.fetchImpl ?? fetch;
    const response = await doFetch(`${base}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    });
    if (!response.ok) {
      throw new Error(`WhatsApp HTTP ${response.status}: ${await response.text()}`);
    }
  }
}
