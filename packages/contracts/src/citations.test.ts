import { describe, expect, it } from "vitest";
import { CitationSchema, formatCitation, toCitation } from "./index";

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
