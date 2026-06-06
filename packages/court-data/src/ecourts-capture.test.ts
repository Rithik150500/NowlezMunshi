import { describe, expect, it } from "vitest";
import {
  assertLiveCaptureAllowed,
  captureCaseHistory,
  captureEndpoint,
  redactToShape,
} from "./ecourts-capture";
import { identityEcourtsCodec } from "./ecourts-codec";
import type { EcourtsTransport } from "./ecourts-protocol";

describe("redactToShape", () => {
  it("keeps keys and nesting but replaces leaf values with their type (PII-safe shape)", () => {
    const decoded = {
      history: {
        petitioner: "Ramesh Kumar",
        year: 2026,
        disposed: true,
        next: null,
        orders: [{ order_no: "1", pdf_url: "https://app/o.pdf" }],
        tags: [],
      },
    };
    expect(redactToShape(decoded)).toEqual({
      history: {
        petitioner: "<string>",
        year: "<number>",
        disposed: "<boolean>",
        next: null,
        orders: [{ order_no: "<string>", pdf_url: "<string>" }],
        tags: [],
      },
    });
  });
});

describe("captureEndpoint", () => {
  it("returns the RAW decoded response (not a mapped DTO) and sends the params + bearer", async () => {
    let sentUrl = "";
    let sentQuery: Record<string, string> = {};
    let sentHeaders: Record<string, string> = {};
    const transport: EcourtsTransport = async (url, query, headers) => {
      sentUrl = url;
      sentQuery = { ...query };
      sentHeaders = { ...headers };
      return JSON.stringify({ history: { pet_name: "X", est_code: "42" } });
    };

    const decoded = await captureEndpoint(
      "caseHistoryWebService.php",
      { cinum: "KLER010012342026", language_flag: "english" },
      { baseUrl: "https://app.example/ecourt_mobile_DC/", codec: identityEcourtsCodec, transport },
    );

    expect(decoded).toEqual({ history: { pet_name: "X", est_code: "42" } });
    expect(sentUrl).toBe("https://app.example/ecourt_mobile_DC/caseHistoryWebService.php");
    expect(JSON.parse(sentQuery.params ?? "{}").cinum).toBe("KLER010012342026");
    expect(sentHeaders.Authorization).toMatch(/^Bearer /);
  });

  it("captureCaseHistory sends the CNR as `cinum` with default language flags", async () => {
    let params: Record<string, string> = {};
    const transport: EcourtsTransport = async (_url, query) => {
      params = JSON.parse(query.params ?? "{}");
      return JSON.stringify({ history: {} });
    };
    await captureCaseHistory("KLER010012342026", { codec: identityEcourtsCodec, transport });
    expect(params).toMatchObject({
      cinum: "KLER010012342026",
      language_flag: "english",
      bilingual_flag: "0",
    });
  });
});

describe("assertLiveCaptureAllowed", () => {
  it("refuses unless the operator affirms live authorization via the env flag", () => {
    expect(() => assertLiveCaptureAllowed({})).toThrow(/NOWLEZ_ECOURTS_LIVE_OK/);
    expect(() => assertLiveCaptureAllowed({ NOWLEZ_ECOURTS_LIVE_OK: "0" })).toThrow(/sign-off/i);
    expect(() => assertLiveCaptureAllowed({ NOWLEZ_ECOURTS_LIVE_OK: "1" })).not.toThrow();
  });
});
