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

/** A decided case whose finalOrder is the verified HTML table: [Order No | Order Date | <a> PDF]. */
const caseHistoryWithOrders = {
  ...caseHistory,
  date_of_decision: "2026-05-30",
  finalOrder:
    "<table><thead><tr><th>Order Number</th><th>Order Date</th><th>Order Details</th></tr></thead>" +
    "<tbody><tr><td>1</td><td>30-05-2026</td>" +
    "<td><a href='https://app.ecourts.gov.in/display_pdf.php?filename=abc'>View</a></td></tr></tbody></table>",
};

/** The verified live search response (2026-06-07): numeric-keyed establishment buckets + the exact
 *  caseNos row fields the backend sends, + no_of_establishments + token. */
const searchResponse = {
  no_of_establishments: 1,
  token: "JWT-TEST",
  "0": {
    court_code: "1",
    establishment_name: "Principal District & Sessions Court",
    caseNos: [
      {
        cino: "KLER010012342026",
        case_no: "OS/1234/2026",
        case_no2: 1234,
        case_type: 103,
        case_year: 2026,
        pet_name: "A",
        lpet_name: null,
        res_name: "B",
        lres_name: null,
        extra_party: "",
        party_name1: "A",
        party_name2: "B",
        date_of_decision: null,
        orcase: "",
        reg_year: "2026",
        type_name: "OS",
        petnameadArr: "A Vs B",
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

  it("parses interim/final order HTML tables into orders, and marks a decided case Disposed", async () => {
    const { transport } = recordingTransport(() => ({ history: caseHistoryWithOrders }));
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    expect((await source.getCaseByCnr(CNR)).details.status).toBe("Disposed");
    const orders = await source.getOrders(CNR);
    expect(orders).toHaveLength(1);
    expect(orders[0]?.pdf.uri).toBe("https://app.ecourts.gov.in/display_pdf.php?filename=abc");
    expect(orders[0]?.pdf.contentType).toBe("application/pdf");
    expect(orders[0]?.date).toBe("30-05-2026");
    expect(orders[0]?.id).toContain("KLER010012342026");
  });

  it("skips HTML rows that aren't order rows (headers / malformed / no PDF link)", async () => {
    const { transport } = recordingTransport(() => ({
      history: { ...caseHistory, finalOrder: "<table><tr><td>just one cell</td></tr></table>" },
    }));
    const orders = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).getOrders(CNR);
    expect(orders).toHaveLength(0);
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

  it("maps caseType from type_name and falls back to case_year when reg_year is absent", async () => {
    const resp = {
      no_of_establishments: 1,
      "0": {
        establishment_name: "X Court",
        caseNos: [{ cino: "KLER010012342026", type_name: "CC", case_year: 2025 }],
      },
    };
    const { transport } = recordingTransport(() => resp);
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByParty({ scope: { stateOrHighCourt: "4", court: "1" }, partyName: "X", year: 2026 });
    expect(hits[0]?.caseType).toBe("CC");
    expect(hits[0]?.year).toBe(2025); // reg_year absent → case_year fallback
  });
});

describe("EcourtsMobileSource — cause list (cases_new.php)", () => {
  const scope = { stateOrHighCourt: "4", districtOrBench: "2", court: "5" };

  /** A cause table: a skipped <th> header, a colspan section header, two listing rows (one with a
   *  `cino` attr, one without), and a non-numeric "Total" spacer row that must be skipped. */
  const CAUSE_LIST_HTML =
    "<table id='cause_table'>" +
    "<tr><th>Sr</th><th>Case</th><th>Party</th><th>Adv</th></tr>" +
    "<tr><td colspan='4'>FRESH CASES</td></tr>" +
    "<tr><td>1</td>" +
    "<td><a class='c' case_no='200400000672025' cino='kler010012342026'>OS/67/2025</a> 15-09-2030</td>" +
    "<td>A vs B</td><td>Adv X</td></tr>" +
    "<tr><td>2</td>" +
    "<td><a class='c' case_no='200400000682025'>OS/68/2025</a></td>" +
    "<td>C vs D</td><td>Adv Y</td></tr>" +
    "<tr><td>Total</td><td>spacer</td><td>row</td></tr>" +
    "</table>";

  it("fetches civil + criminal lists and parses the cause table", async () => {
    const { transport, calls } = recordingTransport((_url, params) =>
      params.flag === "civ_t" ? { cases: CAUSE_LIST_HTML } : { cases: false },
    );
    const entries = await new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: identityEcourtsCodec,
    }).getCauseList({ scope, date: "2030-09-15", courtNo: "3" });

    // One cases_new.php call per civil/criminal radio, carrying the courtroom + DD-MM-YYYY date.
    const causes = calls.filter((c) => c.url.endsWith("cases_new.php"));
    expect(causes).toHaveLength(2);
    expect(causes.map((c) => c.params.flag).sort()).toEqual(["civ_t", "cri_t"]);
    const civ = causes.find((c) => c.params.flag === "civ_t");
    expect(civ?.params.court_no).toBe("3");
    expect(civ?.params.court_code).toBe("5");
    expect(civ?.params.causelist_date).toBe("15-09-2030"); // ISO → DD-MM-YYYY
    expect(civ?.params.selprevdays).toBe("0"); // future date → live (not archived) list

    // Civil list → 2 entries; criminal (cases:false) → none.
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first?.item).toBe("1");
    expect(first?.caseNumber).toBe("200400000672025"); // uniform number from case_no= attr
    expect(first?.cnr).toBe("KLER010012342026"); // cino= attr, upper-cased
    expect(first?.parties).toBe("A vs B");
    expect(first?.purpose).toBe("FRESH CASES"); // section header carried down to its rows
    expect(first?.date).toBe("2030-09-15");
    expect(first?.court.court).toBe("5");
    expect(first?.court.stateOrHighCourt).toBe("4");
    expect(second?.item).toBe("2");
    expect(second?.caseNumber).toBe("200400000682025");
    expect(second?.cnr).toBeUndefined(); // no cino attr on this row
  });

  it("throws when the courtroom (courtNo) is not supplied", async () => {
    const { transport } = recordingTransport(() => ({ cases: false }));
    await expect(
      new EcourtsMobileSource({ transport, codec: identityEcourtsCodec }).getCauseList({
        scope,
        date: "2030-09-15",
      }),
    ).rejects.toThrow(/courtNo/i);
  });

  it("returns [] when neither flag has a list (cases: false)", async () => {
    const { transport } = recordingTransport(() => ({ cases: false }));
    const entries = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).getCauseList({ scope, date: "2030-09-15", courtNo: "3" });
    expect(entries).toHaveLength(0);
  });
});
