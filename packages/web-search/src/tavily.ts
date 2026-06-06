import type { WebSearch, WebSearchOptions, WebSearchResponse } from "@nowlez/contracts";

export interface TavilyConfig {
  readonly apiKey: string;
  /** Defaults to "https://api.tavily.com". */
  readonly baseUrl?: string;
  /** Injectable fetch for testing; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

interface TavilyApiResponse {
  readonly answer?: string;
  readonly results?: ReadonlyArray<{
    readonly title?: string;
    readonly url?: string;
    readonly content?: string;
  }>;
}

/**
 * The Tavily web-search client (docs/munshi.md, ADR-0010). The API key is supplied
 * by `selectWebSearch` from the environment.
 */
export class TavilyWebSearch implements WebSearch {
  readonly id = "tavily";

  constructor(private readonly config: TavilyConfig) {}

  async search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse> {
    const doFetch = this.config.fetchImpl ?? fetch;
    const response = await doFetch(`${this.config.baseUrl ?? "https://api.tavily.com"}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        query,
        max_results: options?.maxResults ?? 5,
        include_answer: true,
      }),
    });
    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as TavilyApiResponse;
    return {
      query,
      answer: json.answer,
      results: (json.results ?? []).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      })),
    };
  }
}
