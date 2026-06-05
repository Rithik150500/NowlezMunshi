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
