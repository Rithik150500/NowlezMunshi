import { describe, expect, it } from "vitest";
import { FakeWebSearch, selectWebSearch, TavilyWebSearch } from "./index";

describe("FakeWebSearch", () => {
  it("returns its responder's results", async () => {
    const ws = new FakeWebSearch((q) => ({
      query: q,
      answer: "a",
      results: [{ title: "t", url: "u", snippet: "s" }],
    }));
    const res = await ws.search("hello");
    expect(res.query).toBe("hello");
    expect(res.answer).toBe("a");
    expect(res.results).toHaveLength(1);
  });
});

describe("TavilyWebSearch", () => {
  it("posts the query + key to /search and maps results", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          answer: "42",
          results: [{ title: "T", url: "https://x", content: "C" }],
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    const ws = new TavilyWebSearch({ apiKey: "tvly-test", fetchImpl });
    const res = await ws.search("life?", { maxResults: 3 });

    expect(res.answer).toBe("42");
    expect(res.results[0]).toEqual({ title: "T", url: "https://x", snippet: "C" });
    expect(captured?.url).toBe("https://api.tavily.com/search");
    expect(captured?.body.api_key).toBe("tvly-test");
    expect(captured?.body.query).toBe("life?");
    expect(captured?.body.max_results).toBe(3);
  });

  it("applies a request timeout (passes an abort signal to fetch)", async () => {
    let signal: unknown;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      signal = init?.signal;
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;
    await new TavilyWebSearch({ apiKey: "x", fetchImpl }).search("q");
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 401,
        json: async () => ({}),
        text: async () => "bad key",
      }) as unknown as Response) as typeof fetch;
    const ws = new TavilyWebSearch({ apiKey: "x", fetchImpl });
    await expect(ws.search("q")).rejects.toThrow(/Tavily HTTP 401/);
  });
});

describe("selectWebSearch", () => {
  it("defaults to the fake", () => {
    expect(selectWebSearch()).toBeInstanceOf(FakeWebSearch);
  });

  it("tavily requires TAVILY_API_KEY", () => {
    const saved = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = "";
    try {
      expect(() => selectWebSearch("tavily")).toThrow(/TAVILY_API_KEY/);
    } finally {
      process.env.TAVILY_API_KEY = saved ?? "";
    }
  });
});
