import { asCnr } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import {
  EcourtsMobileSource,
  type EcourtsParamCodec,
  type EcourtsTransport,
} from "./ecourts-mobile-source";

const CNR = asCnr("KLER010012342026");

/** A (provisional-shape) case-by-CNR response, as the mapper expects to receive it. */
const rawCase = {
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

describe("EcourtsMobileSource", () => {
  it("maps a case-by-CNR response to a FetchedCase and sends the CNR to the right URL", async () => {
    let sentUrl = "";
    let sentParams: Record<string, string> = {};
    const transport: EcourtsTransport = async (url, params) => {
      sentUrl = url;
      sentParams = { ...params };
      return rawCase;
    };

    const source = new EcourtsMobileSource({ baseUrl: "https://app.example/", transport });
    const c = await source.getCaseByCnr(CNR);

    expect(c.cnr).toBe(CNR);
    expect(c.court.court).toBe("Principal District & Sessions Court");
    expect(c.details.parties).toBe("A vs B");
    expect(c.details.year).toBe(2026);
    expect(c.details.nextHearingDate).toBe("2026-06-20");
    expect(c.orders).toHaveLength(1);
    expect(c.orders[0]?.pdf.uri).toBe("https://app.example/o1.pdf");
    // Trailing slash trimmed; provisional path appended; CNR carried in the params.
    expect(sentUrl).toBe("https://app.example/services/case/cnr");
    expect(Object.values(sentParams)).toContain("KLER010012342026");
  });

  it("applies a request timeout (passes an abort signal to the default transport's fetch)", async () => {
    let signal: unknown;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return {
        ok: true,
        status: 200,
        json: async () => rawCase,
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    await new EcourtsMobileSource({ fetchImpl }).getCaseByCnr(CNR);
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when the source returns no case", async () => {
    const source = new EcourtsMobileSource({ transport: async () => ({}) });
    await expect(source.getCaseByCnr(asCnr("NOPE"))).rejects.toThrow(/no case found/);
  });

  it("applies the param codec before sending (the request-encryption seam)", async () => {
    let sent: Record<string, string> = {};
    const codec: EcourtsParamCodec = { encode: (p) => ({ enc: JSON.stringify(p) }) };
    const transport: EcourtsTransport = async (_url, params) => {
      sent = { ...params };
      return rawCase;
    };
    await new EcourtsMobileSource({ transport, codec }).getCaseByCnr(CNR);
    expect(sent.enc).toContain("KLER010012342026");
    expect(sent.cino).toBeUndefined(); // raw param was replaced by the codec's output
  });

  it("derives getOrders from the case", async () => {
    const source = new EcourtsMobileSource({ transport: async () => rawCase });
    expect(await source.getOrders(CNR)).toHaveLength(1);
  });

  it("searches by party and maps the hits", async () => {
    const transport: EcourtsTransport = async (url, params) => {
      expect(url).toContain("search/party");
      expect(params).toMatchObject({ party_name: "Sample", year: "2026", state: "Kerala" });
      return {
        results: [
          {
            cnr: "KLER010012342026",
            petitioner: "A",
            respondent: "B",
            court_name: "PDC",
            case_type: "OS",
            reg_no: "1234",
            reg_year: "2026",
          },
        ],
      };
    };
    const hits = await new EcourtsMobileSource({ transport }).searchByParty({
      scope: { stateOrHighCourt: "Kerala" },
      partyName: "Sample",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.cnr).toBe("KLER010012342026");
    expect(hits[0]?.parties).toBe("A vs B");
    expect(hits[0]?.caseNumber).toBe("1234");
  });

  it("searches by case number (also accepts a bare-array response)", async () => {
    const transport: EcourtsTransport = async (url) => {
      expect(url).toContain("search/case-number");
      return [{ cnr: "KLER010012342026", petitioner: "A", respondent: "B" }];
    };
    const hits = await new EcourtsMobileSource({ transport }).searchByCaseNumber({
      scope: { stateOrHighCourt: "Kerala" },
      caseType: "OS",
      caseNumber: "1234",
      year: 2026,
    });
    expect(hits).toHaveLength(1);
  });

  it("maps the cause list, scoped to the requested date", async () => {
    const transport: EcourtsTransport = async (url, params) => {
      expect(url).toContain("cause-list");
      expect(params.date).toBe("2026-06-20");
      return {
        entries: [
          { cnr: "KLER010012342026", case_no: "OS/1234/2026", purpose: "Hearing", item_no: "12" },
        ],
      };
    };
    const entries = await new EcourtsMobileSource({ transport }).getCauseList({
      scope: { stateOrHighCourt: "Kerala" },
      date: "2026-06-20",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.date).toBe("2026-06-20");
    expect(entries[0]?.purpose).toBe("Hearing");
    expect(entries[0]?.court.stateOrHighCourt).toBe("Kerala");
  });

  it("resolves a case by QR (and throws when it does not)", async () => {
    const transport: EcourtsTransport = async (url, params) => {
      expect(url).toContain("case/qr");
      expect(params.qr).toBe("QR-PAYLOAD");
      return rawCase;
    };
    const c = await new EcourtsMobileSource({ transport }).getCaseByQr("QR-PAYLOAD");
    expect(c.cnr).toBe("KLER010012342026");

    await expect(
      new EcourtsMobileSource({ transport: async () => ({}) }).getCaseByQr("x"),
    ).rejects.toThrow(/QR/);
  });
});
