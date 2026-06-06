import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  FakeWhatsAppClient,
  MetaWhatsAppClient,
  parseInboundMedia,
  parseInboundMessage,
  selectWhatsAppClient,
  verifySignature,
  verifyWebhook,
} from "./index";

describe("FakeWhatsAppClient", () => {
  it("records sent messages", async () => {
    const client = new FakeWhatsAppClient();
    await client.sendMessage("15551234567", "hello");
    expect(client.sent).toEqual([{ to: "15551234567", text: "hello" }]);
  });

  it("downloadMedia returns its configured bytes and records the requested id", async () => {
    const client = new FakeWhatsAppClient({
      bytes: new Uint8Array([9, 8, 7]),
      contentType: "application/pdf",
    });
    const media = await client.downloadMedia("MID-1");
    expect([...media.bytes]).toEqual([9, 8, 7]);
    expect(media.contentType).toBe("application/pdf");
    expect(client.downloaded).toEqual(["MID-1"]);
  });
});

describe("MetaWhatsAppClient", () => {
  it("posts a text message to the phone-number id", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    await new MetaWhatsAppClient({
      token: "tok",
      phoneNumberId: "111",
      baseUrl: "https://graph.test/v21.0",
      fetchImpl,
    }).sendMessage("15551234567", "hi");

    expect(captured?.url).toBe("https://graph.test/v21.0/111/messages");
    expect(captured?.body.to).toBe("15551234567");
    expect((captured?.body.text as { body: string }).body).toBe("hi");
  });

  it("applies a request timeout (passes an abort signal to fetch)", async () => {
    let signal: unknown;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    await new MetaWhatsAppClient({ token: "t", phoneNumberId: "1", fetchImpl }).sendMessage(
      "15551234567",
      "hi",
    );
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("downloadMedia resolves the media URL then fetches the bytes", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, _init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).endsWith("/MID")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: "https://cdn.test/blob", mime_type: "application/pdf" }),
          text: async () => "",
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    const media = await new MetaWhatsAppClient({
      token: "tok",
      phoneNumberId: "111",
      baseUrl: "https://graph.test/v21.0",
      fetchImpl,
    }).downloadMedia("MID");

    expect(media.contentType).toBe("application/pdf");
    expect([...media.bytes]).toEqual([1, 2, 3]);
    expect(calls[0]).toBe("https://graph.test/v21.0/MID");
    expect(calls[1]).toBe("https://cdn.test/blob");
  });
});

describe("parseInboundMessage", () => {
  it("extracts a text message", () => {
    const body = {
      entry: [
        {
          changes: [
            { value: { messages: [{ from: "1555", type: "text", text: { body: "hi" } }] } },
          ],
        },
      ],
    };
    expect(parseInboundMessage(body)).toEqual({ from: "1555", text: "hi" });
  });

  it("returns null for non-message payloads (e.g. status updates)", () => {
    expect(parseInboundMessage({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
    expect(parseInboundMessage({})).toBeNull();
  });
});

describe("parseInboundMedia", () => {
  const mediaBody = (message: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { messages: [message] } }] }],
  });

  it("extracts an inbound document message", () => {
    const body = mediaBody({
      from: "1555",
      type: "document",
      document: {
        id: "MID",
        mime_type: "application/pdf",
        filename: "petition.pdf",
        caption: "my petition",
      },
    });
    expect(parseInboundMedia(body)).toEqual({
      from: "1555",
      mediaId: "MID",
      mimeType: "application/pdf",
      filename: "petition.pdf",
      caption: "my petition",
    });
  });

  it("extracts an inbound image message", () => {
    const body = mediaBody({
      from: "1555",
      type: "image",
      image: { id: "IMG", mime_type: "image/jpeg" },
    });
    expect(parseInboundMedia(body)).toMatchObject({
      from: "1555",
      mediaId: "IMG",
      mimeType: "image/jpeg",
    });
  });

  it("returns null for a text message", () => {
    const body = mediaBody({ from: "1555", type: "text", text: { body: "hi" } });
    expect(parseInboundMedia(body)).toBeNull();
  });
});

describe("verifyWebhook", () => {
  it("returns the challenge when the token matches", () => {
    expect(verifyWebhook({ mode: "subscribe", token: "secret", challenge: "42" }, "secret")).toBe(
      "42",
    );
  });

  it("returns null on a token mismatch", () => {
    expect(
      verifyWebhook({ mode: "subscribe", token: "nope", challenge: "42" }, "secret"),
    ).toBeNull();
  });
});

describe("verifySignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "whatsapp_business_account" });
  const sign = (payload: string, withSecret: string) =>
    `sha256=${createHmac("sha256", withSecret).update(payload, "utf8").digest("hex")}`;

  it("accepts a body signed with the app secret", () => {
    expect(verifySignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("rejects a body signed with a different secret", () => {
    expect(verifySignature(body, sign(body, "other-secret"), secret)).toBe(false);
  });

  it("rejects when the body was modified after signing", () => {
    const signature = sign(body, secret);
    expect(verifySignature(`${body} tampered`, signature, secret)).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });
});

describe("selectWhatsAppClient", () => {
  it("defaults to the fake; meta requires credentials", () => {
    expect(selectWhatsAppClient().id).toBe("fake");
    const savedToken = process.env.WHATSAPP_TOKEN;
    process.env.WHATSAPP_TOKEN = "";
    try {
      expect(() => selectWhatsAppClient("meta")).toThrow(/WHATSAPP_TOKEN/);
    } finally {
      process.env.WHATSAPP_TOKEN = savedToken ?? "";
    }
  });
});
