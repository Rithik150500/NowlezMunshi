import { FakeModelClient } from "@nowlez/model";
import { describe, expect, it } from "vitest";
import { IngestionPipeline } from "./index";

const ref = (uri: string, contentType: string): { uri: string; contentType: string } => ({
  uri,
  contentType,
});

describe("IngestionPipeline — normalisation", () => {
  const p = new IngestionPipeline();

  it("knows the per-format plan", () => {
    expect(p.planNormalization("docx")).toEqual(["render-docx-to-pdf", "render-pdf-to-images"]);
  });

  it("renders a PDF to page images", async () => {
    const pages = await p.normalize("pdf", ref("mock://o1.pdf", "application/pdf"));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.contentType).toBe("image/png");
  });

  it("routes a docx through a PDF preview to page images", async () => {
    const pages = await p.normalize("docx", ref("mock://d.docx", "application/octet-stream"));
    expect(pages[0]?.uri).toContain(".preview.pdf#page=");
  });

  it("passes an image straight through", async () => {
    const img = ref("mock://scan.png", "image/png");
    expect(await p.normalize("image", img)).toEqual([img]);
  });
});

describe("IngestionPipeline — classification", () => {
  it("classifies via the smaller model and validates the result", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        cnr: "KLER010012342026",
        documentType: "order",
        summary: "Bail granted.",
      }),
    }));
    const p = new IngestionPipeline(undefined, model);

    const res = await p.classify({ kind: "order", pageImages: [], context: [] });
    expect(res.cnr).toBe("KLER010012342026");
    expect(res.documentType).toBe("order");
    expect(res.summary).toBe("Bail granted.");
  });

  it("rejects malformed model output", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({ cnr: "", documentType: "order", summary: "x" }),
    }));
    const p = new IngestionPipeline(undefined, model);
    await expect(p.classify({ kind: "order", pageImages: [], context: [] })).rejects.toThrow();
  });
});
