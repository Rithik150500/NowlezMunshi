import { describe, expect, it } from "vitest";
import { createMobileApp, NowlezClient } from "./index";

/** A fetch that returns a fixed JSON body and records the calls. */
function recordingFetch(body: unknown) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("NowlezClient", () => {
  it("lists and adds cases over the HTTP API", async () => {
    const { fetchImpl, calls } = recordingFetch([{ cnr: "KLER010012342026" }]);
    const client = new NowlezClient({ baseUrl: "http://x/api", fetch: fetchImpl });

    expect(await client.listCases()).toHaveLength(1);
    await client.addCase("KLER010012342026");

    expect(calls[0]).toEqual({ url: "http://x/api/cases", method: "GET" });
    expect(calls[1]).toEqual({ url: "http://x/api/cases", method: "POST" });
  });

  it("asks the Munshi and surfaces the tool-call trace", async () => {
    const { fetchImpl } = recordingFetch({
      text: "ok",
      citations: [],
      toolCalls: [{ name: "read", ok: true }],
    });
    const reply = await new NowlezClient({ fetch: fetchImpl }).askMunshi("hi");
    expect(reply.text).toBe("ok");
    expect(reply.toolCalls[0]?.name).toBe("read");
  });

  it("throws on a non-ok response", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(new NowlezClient({ fetch: failing }).listCases()).rejects.toThrow(/HTTP 500/);
  });
});

describe("createMobileApp", () => {
  it("exposes the CASES and MUNSHI tabs over the client", () => {
    const app = createMobileApp();
    expect(typeof app.cases.list).toBe("function");
    expect(typeof app.cases.causeList).toBe("function");
    expect(typeof app.munshi.ask).toBe("function");
  });
});
