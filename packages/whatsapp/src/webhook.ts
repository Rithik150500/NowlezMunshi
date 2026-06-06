import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Meta webhook POST against its `X-Hub-Signature-256` header — the
 * `sha256=<hex>` HMAC of the raw request body keyed by the app secret (ADR-0013).
 * Constant-time; returns false when the header is absent or does not match.
 */
export function verifySignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const got = Buffer.from(signatureHeader);
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

export interface InboundMessage {
  readonly from: string;
  readonly text: string;
}

interface WebhookMedia {
  readonly id?: string;
  readonly mime_type?: string;
  readonly filename?: string;
  readonly caption?: string;
}

interface WebhookBody {
  entry?: ReadonlyArray<{
    changes?: ReadonlyArray<{
      value?: {
        messages?: ReadonlyArray<{
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: WebhookMedia;
          document?: WebhookMedia;
        }>;
      };
    }>;
  }>;
}

/** Extract the first inbound text message from a Meta webhook body (or null). */
export function parseInboundMessage(body: unknown): InboundMessage | null {
  const message = (body as WebhookBody).entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message?.type === "text" && message.from && message.text?.body) {
    return { from: message.from, text: message.text.body };
  }
  return null;
}

/** An inbound media message — an uploaded image or document. */
export interface InboundMedia {
  readonly from: string;
  readonly mediaId: string;
  readonly mimeType: string;
  readonly filename?: string;
  readonly caption?: string;
}

/** Extract the first inbound media message (image or document) from a Meta webhook body (or null). */
export function parseInboundMedia(body: unknown): InboundMedia | null {
  const message = (body as WebhookBody).entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message?.from) {
    return null;
  }
  const media =
    message.type === "image"
      ? message.image
      : message.type === "document"
        ? message.document
        : undefined;
  if (!media?.id || !media.mime_type) {
    return null;
  }
  return {
    from: message.from,
    mediaId: media.id,
    mimeType: media.mime_type,
    filename: media.filename,
    caption: media.caption,
  };
}

/**
 * Meta webhook GET verification: returns the challenge to echo back when the
 * subscribe mode and verify token match.
 */
export function verifyWebhook(
  params: { mode?: string; token?: string; challenge?: string },
  expectedToken: string,
): string | null {
  if (params.mode === "subscribe" && params.token === expectedToken && params.challenge) {
    return params.challenge;
  }
  return null;
}
