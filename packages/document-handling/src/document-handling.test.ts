import { describe, expect, it } from "vitest";
import { DocxPipeline, NodeVmDocxSandbox, VIEWER_CONTENT_TYPES } from "./index";

const SNIPPET = `return new docx.Document({
  sections: [{ children: [ new docx.Paragraph({ children: [ new docx.TextRun("Hello") ] }) ] }],
});`;

describe("Document handling", () => {
  it("serves three viewer content types", () => {
    expect(VIEWER_CONTENT_TYPES).toEqual(["pdf", "docx", "image"]);
  });
});

describe("NodeVmDocxSandbox", () => {
  it("compiles docx-js code into a real .docx (a zip starting with PK)", async () => {
    const bytes = await new NodeVmDocxSandbox().compile(SNIPPET);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
  });

  it("rejects code that does not return a Document", async () => {
    await expect(new NodeVmDocxSandbox().compile("return 123;")).rejects.toThrow(/Document/);
  });

  it("bounds runaway code with a timeout", async () => {
    await expect(
      new NodeVmDocxSandbox({ timeoutMs: 50 }).compile("while (true) {}"),
    ).rejects.toThrow();
  });
});

describe("DocxPipeline", () => {
  it("compiles docx-js, then renders a PDF preview", async () => {
    const pipeline = new DocxPipeline();
    const bytes = await pipeline.compile(SNIPPET);
    expect(bytes[0]).toBe(0x50);

    const preview = await pipeline.renderPdfPreview({
      uri: "mock://draft.docx",
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(preview.contentType).toBe("application/pdf");
  });
});
