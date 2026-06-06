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

  it("does not implement search / cause-list / QR yet", async () => {
    const source = new EcourtsMobileSource({ transport: async () => rawCase });
    await expect(
      source.searchByParty({ scope: { stateOrHighCourt: "Kerala" }, partyName: "x", year: 2026 }),
    ).rejects.toThrow(/not implemented/);
    await expect(
      source.getCauseList({ scope: { stateOrHighCourt: "Kerala" }, date: "2026-06-20" }),
    ).rejects.toThrow(/not implemented/);
  });
});
