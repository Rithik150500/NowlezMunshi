import { asCnr, asFileId, asOrderId, type FileDocument, type Order } from "@nowlez/contracts";
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

  it("tolerates classifier output wrapped in a ```json fenced block", async () => {
    const fenced = [
      "```json",
      JSON.stringify({ cnr: "KLER010012342026", documentType: "order", summary: "Bail granted." }),
      "```",
    ].join("\n");
    const p = new IngestionPipeline(undefined, new FakeModelClient(() => ({ text: fenced })));
    const res = await p.classify({ kind: "order", pageImages: [], context: [] });
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

describe("IngestionPipeline — ingest (runner)", () => {
  it("normalises, classifies, and enriches a stored File (identity preserved)", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        cnr: "KLER010012342026",
        documentType: "evidence",
        summary: "An uploaded affidavit.",
      }),
    }));
    const file: FileDocument = {
      id: asFileId("F1"),
      cnr: asCnr("KLER010012342026"),
      original: { uri: "blob:x", contentType: "image/png", bytes: 3 },
      pageImages: [],
      documentType: "uploaded",
      summary: "",
      origin: "user-uploaded",
    };

    const enriched = await new IngestionPipeline(undefined, model).ingest(file, []);
    expect(enriched.documentType).toBe("evidence");
    expect(enriched.summary).toBe("An uploaded affidavit.");
    expect(enriched.pageImages.length).toBeGreaterThan(0);
    expect(enriched.id).toBe(file.id);
    expect(enriched.origin).toBe("user-uploaded");
  });

  it("rejects an unsupported content type", async () => {
    const file: FileDocument = {
      id: asFileId("F2"),
      cnr: asCnr("KLER010012342026"),
      original: { uri: "blob:y", contentType: "text/plain", bytes: 1 },
      pageImages: [],
      documentType: "uploaded",
      summary: "",
      origin: "user-uploaded",
    };
    await expect(new IngestionPipeline().ingest(file, [])).rejects.toThrow(/Unsupported/);
  });

  it("ingests a court order — fills its summary + page images (identity preserved)", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        cnr: "KLER010012342026",
        documentType: "order",
        summary: "Bail granted.",
      }),
    }));
    const order: Order = {
      id: asOrderId("O1"),
      cnr: asCnr("KLER010012342026"),
      sourcePdf: { uri: "mock://o1.pdf", contentType: "application/pdf" },
      pageImages: [],
      summary: "",
    };

    const enriched = await new IngestionPipeline(undefined, model).ingestOrder(order, []);
    expect(enriched.summary).toBe("Bail granted.");
    expect(enriched.pageImages.length).toBeGreaterThan(0);
    expect(enriched.id).toBe(order.id);
  });
});
