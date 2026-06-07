import { createCipheriv } from "node:crypto";
import { asCnr } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import {
  createEcourtsCodec,
  ECOURTS_RESPONSE_KEY_HEX,
  identityEcourtsCodec,
} from "./ecourts-codec";
import { EcourtsMobileSource, type EcourtsTransport } from "./ecourts-mobile-source";

const CNR = asCnr("KLER010012342026");
const DC_BASE = "https://app.example/ecourt_mobile_DC/";

/** The verified `caseHistoryWebService.php` `history` object (real field names; no orders here). */
const caseHistory = {
  cino: "KLER010012342026",
  type_name: "OS",
  reg_no: 1234,
  reg_year: 2026,
  date_of_filing: "2026-02-01",
  dt_regis: "2026-02-05",
  date_next_list: "2026-06-20",
  date_of_decision: null,
  pet_name: "A",
  res_name: "B",
  state_name: "Kerala",
  district_name: "Ernakulam",
  court_name: "Principal District & Sessions Court",
  interimOrder: null,
  finalOrder: null,
};

/** A decided case (interim/final orders arrive as HTML strings — not parsed into structured orders). */
const caseHistoryDecided = {
  ...caseHistory,
  date_of_decision: "2026-05-30",
  finalOrder: "<table id='finalOrderTable'><tr><td>30-05-2026</td></tr></table>",
};

/** The verified search response: numeric-keyed establishment buckets + no_of_establishments + token. */
const searchResponse = {
  no_of_establishments: 1,
  "0": {
    court_code: "1",
    establishment_name: "Principal District & Sessions Court",
    caseNos: [
      {
        cino: "KLER010012342026",
        pet_name: "A",
        res_name: "B",
        case_no: "OS/1234/2026",
        reg_year: "2026",
      },
    ],
  },
};

/** Build a real app-format encrypted response body (`ivHex(32) + base64(ct)`) for decode tests. */
function realResponseBody(payload: unknown): string {
  const ivHex = "00112233445566778899aabbccddeeff";
  const cipher = createCipheriv(
    "aes-128-cbc",
    Buffer.from(ECOURTS_RESPONSE_KEY_HEX, "hex"),
    Buffer.from(ivHex, "hex"),
  );
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return ivHex + ct.toString("base64");
}

interface RecordedCall {
  readonly url: string;
  readonly params: Record<string, string>;
  readonly headers: Record<string, string>;
}

/**
 * A fake transport (identity codec) that satisfies the appReleaseWebService.php bootstrap with a JWT,
 * then routes every other call through `responder`. Records each call for assertions.
 */
function recordingTransport(
  responder: (endpoint: string, params: Record<string, string>) => unknown,
): {
  transport: EcourtsTransport;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const transport: EcourtsTransport = async (url, query, headers) => {
    const params = JSON.parse(query.params ?? "{}");
    calls.push({ url, params, headers: { ...headers } });
    if (url.endsWith("appReleaseWebService.php")) {
      return JSON.stringify({ token: "JWT-TEST" });
    }
    return JSON.stringify(responder(url, params));
  };
  return { transport, calls };
}

describe("EcourtsMobileSource — session bootstrap", () => {
  it("mints a JWT via appReleaseWebService.php (no bearer) before authenticated calls", async () => {
    const { transport, calls } = recordingTransport(() => ({ history: caseHistory }));
    const source = new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: identityEcourtsCodec,
    });
    const c = await source.getCaseByCnr(CNR);

    // First call is the unauthenticated bootstrap.
    expect(calls[0]?.url).toBe("https://app.example/ecourt_mobile_DC/appReleaseWebService.php");
    expect(calls[0]?.headers.Authorization).toBeUndefined();
    expect(calls[0]?.params.version).toBe("3.0");
    expect(calls[0]?.params.uid).toMatch(/:in\.gov\.ecourts\.eCourtsServices$/);

    // Then the authed case-history call carries the minted JWT as the bearer.
    const hist = calls.find((call) => call.url.endsWith("caseHistoryWebService.php"));
    expect(hist?.params.cinum).toBe("KLER010012342026");
    expect(hist?.headers.Authorization).toMatch(/^Bearer /);
    expect(c.cnr).toBe(CNR);
    expect(c.court.court).toBe("Principal District & Sessions Court");
  });

  it("bootstraps only once across multiple operations (reuses the JWT)", async () => {
    const { transport, calls } = recordingTransport(() => ({ history: caseHistory }));
    const source = new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: identityEcourtsCodec,
    });
    await source.getCaseByCnr(CNR);
    await source.getCaseByCnr(CNR);
    const bootstraps = calls.filter((call) => call.url.endsWith("appReleaseWebService.php"));
    expect(bootstraps).toHaveLength(1);
  });

  it("throws when the bootstrap returns no token", async () => {
    const transport: EcourtsTransport = async (url) => {
      if (url.endsWith("appReleaseWebService.php")) {
        return JSON.stringify({ version_compatible: "Y" }); // no token
      }
      return JSON.stringify({ history: caseHistory });
    };
    const source = new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: identityEcourtsCodec,
    });
    await expect(source.getCaseByCnr(CNR)).rejects.toThrow(/bootstrap|token/i);
  });
});

describe("EcourtsMobileSource — case history", () => {
  it("decodes a real app-format (AES-encrypted) response body end-to-end", async () => {
    const transport: EcourtsTransport = async (url) =>
      url.endsWith("appReleaseWebService.php")
        ? JSON.stringify({ token: "JWT" }) // plaintext bootstrap response
        : realResponseBody({ history: caseHistory }); // encrypted case body
    const source = new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: createEcourtsCodec(),
    });
    const c = await source.getCaseByCnr(CNR);
    expect(c.cnr).toBe(CNR);
    expect(c.details.status).toBe("Pending");
  });

  it("maps the verified history fields", async () => {
    const { transport } = recordingTransport(() => ({ history: caseHistory }));
    const c = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).getCaseByCnr(CNR);
    expect(c.court.stateOrHighCourt).toBe("Kerala");
    expect(c.details.parties).toBe("A vs B");
    expect(c.details.caseType).toBe("OS");
    expect(c.details.caseNumber).toBe("1234");
    expect(c.details.year).toBe(2026);
    expect(c.details.nextHearingDate).toBe("2026-06-20");
    expect(c.orders).toHaveLength(0);
  });

  it("throws when the backend returns no case", async () => {
    const { transport } = recordingTransport(() => ({ history: null }));
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    await expect(source.getCaseByCnr(CNR)).rejects.toThrow(/no case/i);
  });

  it("the default transport issues GETs with a params query and an abort signal", async () => {
    const urls: string[] = [];
    let method = "";
    let signal: unknown;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      urls.push(u);
      method = init?.method ?? "GET";
      signal = init?.signal;
      const text = u.includes("appReleaseWebService.php")
        ? JSON.stringify({ token: "JWT" })
        : realResponseBody({ history: caseHistory });
      return { ok: true, status: 200, text: async () => text } as unknown as Response;
    }) as typeof fetch;

    const c = await new EcourtsMobileSource({ baseUrl: DC_BASE, fetchImpl }).getCaseByCnr(CNR);
    expect(method).toBe("GET");
    expect(urls.some((u) => u.includes("caseHistoryWebService.php?params="))).toBe(true);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(c.cnr).toBe(CNR);
  });

  it("derives getOrders from the case; HTML order tables yield no structured orders yet", async () => {
    const { transport } = recordingTransport(() => ({ history: caseHistoryDecided }));
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    expect((await source.getCaseByCnr(CNR)).details.status).toBe("Disposed");
    expect(await source.getOrders(CNR)).toHaveLength(0);
  });

  it("resolves a case by QR (extracts the CNR) and rejects a QR with no CNR", async () => {
    const { transport, calls } = recordingTransport(() => ({ history: caseHistory }));
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    const c = await source.getCaseByQr("https://app.ecourts.gov.in/?cino=KLER010012342026&x=1");
    expect(c.cnr).toBe(CNR);
    expect(calls.find((call) => call.url.endsWith("caseHistoryWebService.php"))?.params.cinum).toBe(
      "KLER010012342026",
    );
    await expect(
      new EcourtsMobileSource({ transport, codec: identityEcourtsCodec }).getCaseByQr("no-cnr"),
    ).rejects.toThrow(/QR/i);
  });
});

describe("EcourtsMobileSource — search (numeric-keyed establishment buckets)", () => {
  it("flattens party-search buckets into CaseSearchResults", async () => {
    const { transport, calls } = recordingTransport(() => searchResponse);
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByParty({
      scope: { stateOrHighCourt: "4", districtOrBench: "2", court: "1" },
      partyName: "A",
      year: 2026,
    });
    const call = calls.find((c) => c.url.endsWith("showDataWebService.php"));
    expect(call?.params.court_code_arr).toBe("1");
    expect(call?.params.pet_name).toBe("A");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.cnr).toBe("KLER010012342026");
    expect(hits[0]?.parties).toBe("A vs B");
    expect(hits[0]?.court.court).toBe("Principal District & Sessions Court");
    expect(hits[0]?.caseNumber).toBe("OS/1234/2026");
    expect(hits[0]?.year).toBe(2026);
  });

  it("flattens case-number-search buckets and ignores non-numeric keys (token, no_of_establishments)", async () => {
    const { transport } = recordingTransport(() => searchResponse);
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByCaseNumber({
      scope: { stateOrHighCourt: "4", districtOrBench: "2", court: "1" },
      caseType: "103",
      caseNumber: "1234",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.cnr).toBe("KLER010012342026");
  });

  it("returns [] when the search finds no establishment buckets", async () => {
    const { transport } = recordingTransport(() => ({ no_of_establishments: 0 }));
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByParty({
      scope: { stateOrHighCourt: "4", court: "1" },
      partyName: "Nobody",
      year: 2026,
    });
    expect(hits).toHaveLength(0);
  });
});
