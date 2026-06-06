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

interface WebhookBody {
  entry?: ReadonlyArray<{
    changes?: ReadonlyArray<{
      value?: {
        messages?: ReadonlyArray<{
          from?: string;
          type?: string;
          text?: { body?: string };
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
