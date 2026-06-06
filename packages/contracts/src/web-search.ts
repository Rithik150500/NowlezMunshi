/**
 * The web-search port (docs/munshi.md). The Munshi's `web_search` tool reaches the
 * web through this seam; the adapter is Tavily (ADR-0010), with a deterministic
 * fake for tests. Adapters live in @nowlez/web-search.
 */
export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface WebSearchResponse {
  readonly query: string;
  readonly results: readonly WebSearchResult[];
  /** An optional synthesised answer (Tavily can return one). */
  readonly answer?: string;
}

export interface WebSearchOptions {
  readonly maxResults?: number;
}

export interface WebSearch {
  /** Which implementation this is (e.g. "fake", "tavily"). */
  readonly id: string;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse>;
}
