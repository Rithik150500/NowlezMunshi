import { type OutboundDocument, type WhatsAppClient, withTimeout } from "@nowlez/contracts";

export interface MetaWhatsAppConfig {
  readonly token: string;
  readonly phoneNumberId: string;
  /** Defaults to "https://graph.facebook.com/v21.0". */
  readonly baseUrl?: string;
  /** Injectable fetch for testing; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Per-request timeout in ms; a hung endpoint aborts instead of blocking. Default 30s. */
  readonly timeoutMs?: number;
}

/** The Meta WhatsApp Cloud API client. Config is supplied by `selectWhatsAppClient`. */
export class MetaWhatsAppClient implements WhatsAppClient {
  readonly id = "meta";

  constructor(private readonly config: MetaWhatsAppConfig) {}

  async sendMessage(to: string, text: string): Promise<void> {
    const base = this.config.baseUrl ?? "https://graph.facebook.com/v21.0";
    const doFetch = withTimeout(this.config.fetchImpl ?? fetch, this.config.timeoutMs ?? 30_000);
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

  /** Upload the bytes as media, then send a document message referencing the media id. */
  async sendDocument(to: string, document: OutboundDocument): Promise<void> {
    const base = this.config.baseUrl ?? "https://graph.facebook.com/v21.0";
    const doFetch = withTimeout(this.config.fetchImpl ?? fetch, this.config.timeoutMs ?? 30_000);
    const auth = `Bearer ${this.config.token}`;

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", document.contentType);
    form.append(
      "file",
      // Copy into a fresh ArrayBuffer-backed view so the Blob type is satisfied.
      new Blob([new Uint8Array(document.bytes)], { type: document.contentType }),
      document.filename,
    );
    const upload = await doFetch(`${base}/${this.config.phoneNumberId}/media`, {
      method: "POST",
      headers: { authorization: auth },
      body: form,
    });
    if (!upload.ok) {
      throw new Error(`WhatsApp media upload HTTP ${upload.status}: ${await upload.text()}`);
    }
    const { id } = (await upload.json()) as { id: string };

    const response = await doFetch(`${base}/${this.config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: { id, filename: document.filename, caption: document.caption },
      }),
    });
    if (!response.ok) {
      throw new Error(`WhatsApp HTTP ${response.status}: ${await response.text()}`);
    }
  }
}
