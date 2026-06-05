import type { WebSearch } from "@nowlez/contracts";
import { FakeWebSearch } from "./fake";
import { TavilyWebSearch } from "./tavily";

export type WebSearchKind = "fake" | "tavily";

/**
 * Select a WebSearch implementation (ADR-0010). The deterministic fake is the
 * default (so tests and CI never touch a network); "tavily" reads its key from
 * the environment.
 */
export function selectWebSearch(kind: WebSearchKind = "fake"): WebSearch {
  switch (kind) {
    case "fake":
      return new FakeWebSearch();
    case "tavily": {
      const apiKey = process.env.TAVILY_API_KEY;
      if (!apiKey) {
        throw new Error("tavily web search requires TAVILY_API_KEY");
      }
      return new TavilyWebSearch({ apiKey });
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled web search kind: ${String(x)}`);
}
