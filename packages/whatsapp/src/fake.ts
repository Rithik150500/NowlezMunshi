import type { DownloadedMedia, OutboundDocument, WhatsAppClient } from "@nowlez/contracts";

/** Records sent messages/documents instead of calling WhatsApp — for dev and tests. */
export class FakeWhatsAppClient implements WhatsAppClient {
  readonly id = "fake";
  readonly sent: { to: string; text: string }[] = [];
  readonly documents: { to: string; document: OutboundDocument }[] = [];
  /** Media ids passed to downloadMedia(), in order. */
  readonly downloaded: string[] = [];

  /** `media` is the canned result of downloadMedia() (for tests). */
  constructor(
    private readonly media: DownloadedMedia = {
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/pdf",
    },
  ) {}

  async sendMessage(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  async sendDocument(to: string, document: OutboundDocument): Promise<void> {
    this.documents.push({ to, document });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedMedia> {
    this.downloaded.push(mediaId);
    return this.media;
  }
}
