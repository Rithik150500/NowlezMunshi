import { describe, expect, it } from "vitest";
import {
  type CitationAuthority,
  CitationSchema,
  formatCitation,
  isKnownCitation,
  toCitation,
  unknownCitations,
} from "./index";

describe("citations", () => {
  it("accepts each citation kind", () => {
    expect(CitationSchema.safeParse({ kind: "cnr", cnr: "X" }).success).toBe(true);
    expect(CitationSchema.safeParse({ kind: "order", orderId: "O", page: 3 }).success).toBe(true);
    expect(CitationSchema.safeParse({ kind: "file", fileId: "F", page: 1 }).success).toBe(true);
    expect(CitationSchema.safeParse({ kind: "url", url: "https://ecourts.gov.in" }).success).toBe(
      true,
    );
  });

  it("rejects non-positive pages and bad URLs", () => {
    expect(CitationSchema.safeParse({ kind: "order", orderId: "O", page: 0 }).success).toBe(false);
    expect(CitationSchema.safeParse({ kind: "url", url: "not-a-url" }).success).toBe(false);
  });

  it("formats a citation as an inline tag", () => {
    const c = toCitation({ kind: "order", orderId: "O", page: 2 });
    expect(formatCitation(c)).toBe("[order:O#2]");
  });
});

describe("citation authority (existence check)", () => {
  const authority: CitationAuthority = {
    cnrs: new Set(["KLER010012342026"]),
    orderPages: new Map([["O1", 3]]),
    filePages: new Map([["F1", 2]]),
  };

  it("accepts known ids with an in-range page, and any URL", () => {
    expect(isKnownCitation({ kind: "cnr", cnr: "KLER010012342026" }, authority)).toBe(true);
    expect(isKnownCitation({ kind: "order", orderId: "O1", page: 3 }, authority)).toBe(true);
    expect(isKnownCitation({ kind: "file", fileId: "F1", page: 1 }, authority)).toBe(true);
    expect(isKnownCitation({ kind: "url", url: "https://ecourts.gov.in" }, authority)).toBe(true);
  });

  it("flags absent ids and out-of-range pages", () => {
    const cites = [
      { kind: "cnr", cnr: "NOPE" }, // unknown CNR
      { kind: "order", orderId: "O1", page: 2 }, // ok (within 3 pages)
      { kind: "order", orderId: "O1", page: 9 }, // page out of range
      { kind: "file", fileId: "FX", page: 1 }, // unknown file
    ] as const;
    const unknown = unknownCitations(cites, authority);
    expect(unknown.map((c) => c.kind)).toEqual(["cnr", "order", "file"]);
  });
});
