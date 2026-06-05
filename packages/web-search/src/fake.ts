import type { WebSearch, WebSearchResponse } from "@nowlez/contracts";

export type FakeWebSearchResponder = (query: string) => WebSearchResponse;

const defaultResponder: FakeWebSearchResponder = (query) => ({
  query,
  results: [
    {
      title: "(stub web search)",
      url: "https://example.invalid",
      snippet: "Set TAVILY_API_KEY to enable real web search.",
    },
  ],
});

/** A deterministic, network-free WebSearch for dev and tests. */
export class FakeWebSearch implements WebSearch {
  readonly id = "fake";

  constructor(private readonly responder: FakeWebSearchResponder = defaultResponder) {}

  async search(query: string): Promise<WebSearchResponse> {
    return this.responder(query);
  }
}
