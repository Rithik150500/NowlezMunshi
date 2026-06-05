import { describe, expect, it } from "vitest";
import { FakeModelClient, OpenAiCompatibleModelClient } from "./index";

describe("FakeModelClient", () => {
  it("returns what its responder produces", async () => {
    const client = new FakeModelClient((req) => ({ text: `echo:${req.model}` }));
    const res = await client.complete({
      model: "large",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.text).toBe("echo:large");
  });
});

describe("OpenAiCompatibleModelClient", () => {
  it("posts to /chat/completions, maps the model id, and parses the content", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "hello" } }] }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    const client = new OpenAiCompatibleModelClient({
      baseUrl: "http://host/v1",
      smallModel: "small-id",
      largeModel: "large-id",
      fetchImpl,
    });

    const res = await client.complete({
      model: "large",
      messages: [{ role: "user", content: "hi" }],
      responseFormat: "json",
    });

    expect(res.text).toBe("hello");
    expect(captured?.url).toBe("http://host/v1/chat/completions");
    expect(captured?.body.model).toBe("large-id");
    expect(captured?.body.response_format).toEqual({ type: "json_object" });
  });

  it("sends tools and parses tool calls from the response", async () => {
    let captured: Record<string, unknown> | undefined;
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      captured = JSON.parse(String(init?.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  { id: "c1", function: { name: "full_case_details", arguments: '{"cnr":"X"}' } },
                ],
              },
            },
          ],
        }),
        text: async () => "",
      } as unknown as Response;
    }) as typeof fetch;

    const client = new OpenAiCompatibleModelClient({
      baseUrl: "http://host/v1",
      smallModel: "s",
      largeModel: "l",
      fetchImpl,
    });

    const res = await client.complete({
      model: "large",
      messages: [{ role: "user", content: "status?" }],
      tools: [
        { name: "full_case_details", description: "fetch a case", parameters: { type: "object" } },
      ],
    });

    expect(res.toolCalls?.[0]?.name).toBe("full_case_details");
    expect(res.toolCalls?.[0]?.arguments).toBe('{"cnr":"X"}');
    expect((captured?.tools as unknown[]).length).toBe(1);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => "boom",
      }) as unknown as Response) as typeof fetch;
    const client = new OpenAiCompatibleModelClient({
      baseUrl: "http://host/v1",
      smallModel: "s",
      largeModel: "l",
      fetchImpl,
    });
    await expect(
      client.complete({ model: "small", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
