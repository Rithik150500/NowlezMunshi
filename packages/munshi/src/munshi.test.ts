import {
  asCnr,
  asFileId,
  type BlobStore,
  type Case,
  type CaseRepository,
  type CourtDataSource,
  type FetchedCase,
  type FileDocument,
} from "@nowlez/contracts";
import { FakeModelClient } from "@nowlez/model";
import { describe, expect, it } from "vitest";
import { DEFAULT_MUNSHI_INSTRUCTIONS, Munshi, munshiHandlers } from "./index";

describe("Munshi", () => {
  it("exposes the six tools", () => {
    expect(new Munshi().tools()).toHaveLength(6);
  });

  it("assembles a context package from mini-details + default instructions", () => {
    const ctx = new Munshi().assembleContext([
      {
        cnr: asCnr("KLER010012342026"),
        court: {
          stateOrHighCourt: "Kerala",
          districtOrBench: "Ernakulam",
          court: "Principal District & Sessions Court",
        },
        orders: [],
        files: [],
      },
    ]);
    expect(ctx.miniDetails).toHaveLength(1);
    expect(ctx.instructions).toBe(DEFAULT_MUNSHI_INSTRUCTIONS);
  });

  it("returns a cited response directly when the model makes no tool calls", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        text: "Bail was granted.",
        citations: [{ kind: "cnr", cnr: "KLER010012342026" }],
      }),
    }));
    const munshi = new Munshi(model);
    const res = await munshi.run("What happened?", munshi.assembleContext([]));
    expect(res.text).toBe("Bail was granted.");
    expect(res.citations).toHaveLength(1);
  });

  it("runs a tool, feeds the result back, then returns the final answer (multi-turn)", async () => {
    const model = new FakeModelClient((req) => {
      const usedTool = req.messages.some((m) => m.role === "tool");
      if (!usedTool) {
        return {
          text: "",
          toolCalls: [
            {
              id: "c1",
              name: "full_case_details",
              arguments: JSON.stringify({ cnr: "KLER010012342026" }),
            },
          ],
        };
      }
      return { text: JSON.stringify({ text: "Status: Pending.", citations: [] }) };
    });

    let handlerCalled = false;
    const munshi = new Munshi(model);
    const res = await munshi.run("status?", munshi.assembleContext([]), {
      full_case_details: async () => {
        handlerCalled = true;
        return JSON.stringify({ status: "Pending" });
      },
    });

    expect(handlerCalled).toBe(true);
    expect(res.text).toBe("Status: Pending.");
  });

  it("reports tools without a handler as unavailable, then completes", async () => {
    const model = new FakeModelClient((req) => {
      const toolMsg = req.messages.find((m) => m.role === "tool");
      if (!toolMsg) {
        return {
          text: "",
          toolCalls: [{ id: "w1", name: "web_search", arguments: JSON.stringify({ query: "x" }) }],
        };
      }
      return { text: JSON.stringify({ text: `noted: ${toolMsg.content}`, citations: [] }) };
    });
    const munshi = new Munshi(model);
    const res = await munshi.run("search the web", munshi.assembleContext([]));
    expect(res.text).toContain("not available yet");
  });

  it("short-circuits when the model asks the user a question", async () => {
    const model = new FakeModelClient(() => ({
      text: "",
      toolCalls: [
        {
          id: "q1",
          name: "ask_user_question",
          arguments: JSON.stringify({ question: "Which case?" }),
        },
      ],
    }));
    const munshi = new Munshi(model);
    const res = await munshi.run("do the thing", munshi.assembleContext([]));
    expect(res.text).toBe("Which case?");
    expect(res.citations).toEqual([]);
  });

  it("rejects malformed final output (no text/citations)", async () => {
    const model = new FakeModelClient(() => ({ text: "{}" }));
    const munshi = new Munshi(model);
    await expect(munshi.run("x", munshi.assembleContext([]))).rejects.toThrow();
  });
});

function makeCase(cnr: string): Case {
  return {
    cnr: asCnr(cnr),
    court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
    details: {},
    tracking: true,
    orders: [],
    files: [],
  };
}

function inMemoryCases(seed: readonly Case[] = []): CaseRepository {
  const map = new Map<string, Case>(seed.map((c): [string, Case] => [c.cnr, c]));
  return {
    async save(value) {
      map.set(value.cnr, value);
    },
    async get(cnr) {
      return map.get(cnr);
    },
    async list() {
      return [...map.values()];
    },
    async delete(cnr) {
      return map.delete(cnr);
    },
  };
}

function inMemoryBlobs(): BlobStore {
  const map = new Map<string, Uint8Array>();
  return {
    id: "fake",
    async put(bytes, contentType) {
      const uri = `blob:${map.size}`;
      map.set(uri, bytes);
      return { uri, contentType, bytes: bytes.length };
    },
    async get(ref) {
      const found = map.get(ref.uri);
      if (!found) {
        throw new Error(`no blob ${ref.uri}`);
      }
      return found;
    },
  };
}

describe("munshiHandlers", () => {
  const fakeCourts = {
    getCaseByCnr: async (): Promise<FetchedCase> => ({
      cnr: asCnr("KLER010012342026"),
      court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
      details: { status: "Pending" },
      orders: [],
    }),
  } as unknown as CourtDataSource;

  it("wires full_case_details via the court-data source", async () => {
    const handlers = munshiHandlers({ courts: fakeCourts });
    const out = await handlers.full_case_details?.({ cnr: "KLER010012342026" });
    expect(out).toContain("KLER010012342026");
    expect(out).toContain("Pending");
  });

  it("wires web_search via the WebSearch port", async () => {
    const handlers = munshiHandlers({
      webSearch: {
        id: "fake",
        search: async (query: string) => ({
          query,
          answer: "A",
          results: [{ title: "T", url: "https://x", snippet: "S" }],
        }),
      },
    });
    const out = await handlers.web_search?.({ query: "hello" });
    expect(out).toContain("https://x");
    expect(out).toContain("A");
  });

  it("write_docx compiles, stores the .docx, and attaches an AI-drafted File", async () => {
    const cases = inMemoryCases([makeCase("KLER010012342026")]);
    const blobs = inMemoryBlobs();
    const handlers = munshiHandlers({
      docx: { compile: async () => new Uint8Array([0x50, 0x4b, 3, 4]) },
      blobs,
      cases,
    });

    const out = await handlers.write_docx?.({
      cnr: "KLER010012342026",
      documentType: "petition",
      summary: "A petition.",
      docxJsCode: "return new docx.Document({ sections: [] });",
      fileName: "petition.docx",
    });

    expect(out).toContain("drafted");
    const updated = await cases.get(asCnr("KLER010012342026"));
    expect(updated?.files).toHaveLength(1);
    expect(updated?.files[0]?.origin).toBe("ai-drafted");
  });

  it("read_docx finds the stored File and extracts its text", async () => {
    const blobs = inMemoryBlobs();
    const ref = await blobs.put(new Uint8Array([1, 2, 3]), "application/octet-stream");
    const file: FileDocument = {
      id: asFileId("F1"),
      cnr: asCnr("KLER010012342026"),
      original: ref,
      pageImages: [],
      documentType: "petition",
      summary: "A petition.",
      origin: "ai-drafted",
    };
    const cases = inMemoryCases([{ ...makeCase("KLER010012342026"), files: [file] }]);

    const handlers = munshiHandlers({
      blobs,
      cases,
      docxReader: { extractText: async () => "Bail granted." },
    });

    expect(await handlers.read_docx?.({ fileId: "F1" })).toBe("Bail granted.");
  });
});
