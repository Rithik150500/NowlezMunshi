import { describe, expect, it } from "vitest";
import { MUNSHI_TOOL_INPUTS, munshiToolDefinitions } from "./index";

describe("munshi tools", () => {
  it("exposes exactly the six spec'd tools", () => {
    const names = munshiToolDefinitions()
      .map((d) => d.name)
      .sort();
    expect(names).toEqual([
      "ask_user_question",
      "full_case_details",
      "read",
      "read_docx",
      "web_search",
      "write_docx",
    ]);
  });

  it("derives a JSON schema and a description for every tool", () => {
    for (const d of munshiToolDefinitions()) {
      expect(d.inputSchema).toBeTypeOf("object");
      expect(d.description.length).toBeGreaterThan(0);
    }
  });

  it("validates the read tool as order OR file (never mixed)", () => {
    expect(
      MUNSHI_TOOL_INPUTS.read.safeParse({
        target: "order",
        orderId: "O",
        startPage: 1,
        endPage: 2,
      }).success,
    ).toBe(true);
    expect(
      MUNSHI_TOOL_INPUTS.read.safeParse({ target: "file", fileId: "F", startPage: 1, endPage: 2 })
        .success,
    ).toBe(true);
    expect(
      MUNSHI_TOOL_INPUTS.read.safeParse({ target: "order", fileId: "F", startPage: 1, endPage: 2 })
        .success,
    ).toBe(false);
  });

  it("requires all five write_docx fields", () => {
    expect(
      MUNSHI_TOOL_INPUTS.write_docx.safeParse({
        cnr: "X",
        documentType: "petition",
        summary: "s",
        docxJsCode: "code",
        fileName: "draft.docx",
      }).success,
    ).toBe(true);
    expect(MUNSHI_TOOL_INPUTS.write_docx.safeParse({ cnr: "X" }).success).toBe(false);
  });
});
