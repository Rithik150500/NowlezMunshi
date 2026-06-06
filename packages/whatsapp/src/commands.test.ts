import { describe, expect, it } from "vitest";
import { parseWhatsAppCommand } from "./index";

describe("parseWhatsAppCommand", () => {
  it("recognises case / cnr lookups (and a bare CNR)", () => {
    expect(parseWhatsAppCommand("case kler010012342026")).toEqual({
      kind: "case",
      cnr: "KLER010012342026",
    });
    expect(parseWhatsAppCommand("cnr KLER010012342026")).toEqual({
      kind: "case",
      cnr: "KLER010012342026",
    });
    expect(parseWhatsAppCommand("KLER010012342026")).toEqual({
      kind: "case",
      cnr: "KLER010012342026",
    });
  });

  it("recognises orders and cause-list", () => {
    expect(parseWhatsAppCommand("orders KLER010012342026")).toMatchObject({ kind: "orders" });
    expect(parseWhatsAppCommand("cause-list 2026-06-20")).toEqual({
      kind: "cause-list",
      date: "2026-06-20",
    });
    expect(parseWhatsAppCommand("cause list 2026-06-20")).toEqual({
      kind: "cause-list",
      date: "2026-06-20",
    });
  });

  it("falls through to the Munshi, and offers help", () => {
    expect(parseWhatsAppCommand("help")).toEqual({ kind: "help" });
    expect(parseWhatsAppCommand("what happened in my bail matter?")).toEqual({
      kind: "munshi",
      text: "what happened in my bail matter?",
    });
  });
});
