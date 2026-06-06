import { describe, expect, it } from "vitest";
import { identityEcourtsCodec } from "./ecourts-codec";
import { type EcourtsTransport, ecourtsRoundTrip, makeEcourtsTransport } from "./ecourts-protocol";

describe("ecourtsRoundTrip", () => {
  it("encrypts params + token, then decrypts the body and extracts a refreshed token", async () => {
    let sentUrl = "";
    let sentQuery: Record<string, string> = {};
    let sentHeaders: Record<string, string> = {};
    const transport: EcourtsTransport = async (url, query, headers) => {
      sentUrl = url;
      sentQuery = { ...query };
      sentHeaders = { ...headers };
      return JSON.stringify({ history: { x: 1 }, token: "T9" });
    };

    const result = await ecourtsRoundTrip({
      url: "https://app.example/ecourt_mobile_DC/caseHistoryWebService.php",
      params: { cinum: "KLER010012342026" },
      token: "",
      codec: identityEcourtsCodec,
      transport,
    });

    expect(result.decoded).toEqual({ history: { x: 1 }, token: "T9" });
    expect(result.token).toBe("T9");
    expect(sentUrl).toContain("caseHistoryWebService.php");
    expect(JSON.parse(sentQuery.params ?? "{}").cinum).toBe("KLER010012342026");
    // identity codec: encrypt("") === '""'
    expect(sentHeaders.Authorization).toBe('Bearer ""');
  });

  it("returns token=null when the response carries no token", async () => {
    const transport: EcourtsTransport = async () => JSON.stringify({ history: {} });
    const result = await ecourtsRoundTrip({
      url: "u",
      params: {},
      token: "",
      codec: identityEcourtsCodec,
      transport,
    });
    expect(result.token).toBeNull();
  });
});

describe("makeEcourtsTransport", () => {
  it("issues a GET with the params query and an abort signal, returning the body text", async () => {
    let calledUrl = "";
    let method = "";
    let signal: unknown;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calledUrl = String(url);
      method = init?.method ?? "GET";
      signal = init?.signal;
      return { ok: true, status: 200, text: async () => "BODY" } as unknown as Response;
    }) as typeof fetch;

    const transport = makeEcourtsTransport(fetchImpl, 30_000);
    const body = await transport(
      "https://app.example/x.php",
      { params: "BLOB" },
      { Authorization: "Bearer Z" },
    );

    expect(body).toBe("BODY");
    expect(method).toBe("GET");
    expect(calledUrl).toBe("https://app.example/x.php?params=BLOB");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on a non-ok response", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 503, text: async () => "" }) as unknown as Response) as typeof fetch;
    const transport = makeEcourtsTransport(fetchImpl, 1000);
    await expect(transport("u", {}, {})).rejects.toThrow(/HTTP 503/);
  });
});
