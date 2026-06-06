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

/** The case object the verified `caseHistoryWebService.php` returns under `history`. The OUTER
 *  envelope (`history`, `token`) is verified from the teardown; the inner field NAMES are still
 *  provisional, so this fixture uses the lenient mapper's expected names. */
const caseHistory = {
  cnr: "KLER010012342026",
  state: "Kerala",
  district: "Ernakulam",
  court_name: "Principal District & Sessions Court",
  petitioner: "A",
  respondent: "B",
  case_type: "OS",
  reg_no: "1234",
  reg_year: "2026",
  status: "Pending",
  next_hearing: "2026-06-20",
  orders: [{ order_no: "1", order_date: "2026-05-30", pdf_url: "https://app.example/o1.pdf" }],
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

const DC_BASE = "https://app.example/ecourt_mobile_DC/";

describe("EcourtsMobileSource — verified protocol", () => {
  it("fetches a case by CNR from caseHistoryWebService.php, sending the CNR as `cinum`", async () => {
    let sentUrl = "";
    let sentQuery: Record<string, string> = {};
    let sentHeaders: Record<string, string> = {};
    const transport: EcourtsTransport = async (url, query, headers) => {
      sentUrl = url;
      sentQuery = { ...query };
      sentHeaders = { ...headers };
      return JSON.stringify({ history: caseHistory });
    };

    const source = new EcourtsMobileSource({
      baseUrl: DC_BASE,
      transport,
      codec: identityEcourtsCodec,
    });
    const c = await source.getCaseByCnr(CNR);

    // The whole param object travels as a single `params` query value (the encrypted blob).
    expect(sentUrl).toBe("https://app.example/ecourt_mobile_DC/caseHistoryWebService.php");
    const params = JSON.parse(sentQuery.params ?? "{}");
    expect(params.cinum).toBe("KLER010012342026");
    expect(params.language_flag).toBeDefined();
    expect(sentHeaders.Authorization).toMatch(/^Bearer /);
    // ...and the `history` envelope is mapped to a FetchedCase.
    expect(c.cnr).toBe(CNR);
    expect(c.court.court).toBe("Principal District & Sessions Court");
    expect(c.details.parties).toBe("A vs B");
    expect(c.details.year).toBe(2026);
    expect(c.orders).toHaveLength(1);
    expect(c.orders[0]?.pdf.uri).toBe("https://app.example/o1.pdf");
  });

  it("decodes a real app-format (AES-encrypted) response body end-to-end", async () => {
    const transport: EcourtsTransport = async () => realResponseBody({ history: caseHistory });
    const source = new EcourtsMobileSource({ transport, codec: createEcourtsCodec() });
    const c = await source.getCaseByCnr(CNR);
    expect(c.cnr).toBe(CNR);
    expect(c.details.status).toBe("Pending");
  });

  it("bootstraps with an empty bearer, then reuses the token returned by the backend", async () => {
    const bearers: string[] = [];
    let call = 0;
    const transport: EcourtsTransport = async (_url, _query, headers) => {
      bearers.push(headers.Authorization ?? "");
      call += 1;
      return JSON.stringify(
        call === 1 ? { token: "T1", history: caseHistory } : { history: caseHistory },
      );
    };
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    await source.getCaseByCnr(CNR);
    await source.getCaseByCnr(CNR);
    // identity codec: encrypt(x) === JSON.stringify(x), so the empty token is `""` and T1 is `"T1"`.
    expect(bearers[0]).toBe('Bearer ""');
    expect(bearers[1]).toBe('Bearer "T1"');
  });

  it("throws when the backend returns no case", async () => {
    const transport: EcourtsTransport = async () => JSON.stringify({ history: null });
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    await expect(source.getCaseByCnr(CNR)).rejects.toThrow(/no case/i);
  });

  it("the default transport issues a GET with the params query and an abort signal", async () => {
    let calledUrl = "";
    let method = "";
    let signal: unknown;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calledUrl = String(url);
      method = init?.method ?? "GET";
      signal = init?.signal;
      return {
        ok: true,
        status: 200,
        text: async () => realResponseBody({ history: caseHistory }),
        json: async () => ({}),
      } as unknown as Response;
    }) as typeof fetch;

    const c = await new EcourtsMobileSource({ baseUrl: DC_BASE, fetchImpl }).getCaseByCnr(CNR);
    expect(method).toBe("GET");
    expect(calledUrl).toContain("caseHistoryWebService.php?");
    expect(calledUrl).toContain("params=");
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(c.cnr).toBe(CNR);
  });

  it("derives getOrders from the case", async () => {
    const transport: EcourtsTransport = async () => JSON.stringify({ history: caseHistory });
    const source = new EcourtsMobileSource({ transport, codec: identityEcourtsCodec });
    expect(await source.getOrders(CNR)).toHaveLength(1);
  });

  it("searches by party via showDataWebService.php (party name as `pet_name`)", async () => {
    let url = "";
    let params: Record<string, string> = {};
    const transport: EcourtsTransport = async (u, q) => {
      url = u;
      params = JSON.parse(q.params ?? "{}");
      return JSON.stringify({
        cases: [{ cnr: "KLER010012342026", petitioner: "A", respondent: "B" }],
      });
    };
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByParty({
      scope: { stateOrHighCourt: "Kerala" },
      partyName: "Sample",
      year: 2026,
    });
    expect(url).toContain("showDataWebService.php");
    expect(params.pet_name).toBe("Sample");
    expect(params.state_code).toBe("Kerala");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.parties).toBe("A vs B");
  });

  it("searches by case number via caseNumberSearch.php (accepts a bare-array response)", async () => {
    const transport: EcourtsTransport = async (u) => {
      expect(u).toContain("caseNumberSearch.php");
      return JSON.stringify([{ cnr: "KLER010012342026", petitioner: "A", respondent: "B" }]);
    };
    const hits = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).searchByCaseNumber({
      scope: { stateOrHighCourt: "Kerala" },
      caseType: "OS",
      caseNumber: "1234",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
  });

  it("maps the cause list via causeListWebService.php, scoped to the date", async () => {
    const transport: EcourtsTransport = async (u, q) => {
      expect(u).toContain("causeListWebService.php");
      expect(JSON.parse(q.params ?? "{}").date).toBe("2026-06-20");
      return JSON.stringify({
        cause_list: [
          { cnr: "KLER010012342026", case_no: "OS/1234/2026", purpose: "Hearing", item_no: "12" },
        ],
      });
    };
    const entries = await new EcourtsMobileSource({
      transport,
      codec: identityEcourtsCodec,
    }).getCauseList({
      scope: { stateOrHighCourt: "Kerala" },
      date: "2026-06-20",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe("2026-06-20");
    expect(entries[0]?.purpose).toBe("Hearing");
    expect(entries[0]?.court.stateOrHighCourt).toBe("Kerala");
  });

  it("resolves a case by QR (extracts the CNR) and rejects a QR with no CNR", async () => {
    const transport: EcourtsTransport = async (u, q) => {
      expect(u).toContain("caseHistoryWebService.php");
      expect(JSON.parse(q.params ?? "{}").cinum).toBe("KLER010012342026");
      return JSON.stringify({ history: caseHistory });
    };
    const c = await new EcourtsMobileSource({ transport, codec: identityEcourtsCodec }).getCaseByQr(
      "https://app.ecourts.gov.in/?cino=KLER010012342026&x=1",
    );
    expect(c.cnr).toBe(CNR);

    await expect(
      new EcourtsMobileSource({ transport, codec: identityEcourtsCodec }).getCaseByQr(
        "no-cnr-here",
      ),
    ).rejects.toThrow(/QR/i);
  });
});
