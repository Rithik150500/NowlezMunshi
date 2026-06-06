/**
 * @nowlez/web-search — WebSearch adapters (ADR-0010). A deterministic fake backs
 * dev and tests; the env-driven Tavily client reaches the real web. The key comes
 * from the environment, never committed.
 */
export { FakeWebSearch, type FakeWebSearchResponder } from "./fake";
export { selectWebSearch, type WebSearchKind } from "./select";
export { type TavilyConfig, TavilyWebSearch } from "./tavily";
