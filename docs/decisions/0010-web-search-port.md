# ADR-0010 — Web search behind a WebSearch port (Tavily)

**Status:** Accepted (Phase 4)

## Context

The Munshi's [`web_search` tool](../munshi.md#the-toolset) reaches the web; the specification
names **[Tavily](../glossary.md#tavily)** as the implementation. As with the other external
dependencies, the engine should not be coupled to the provider, secrets must stay out of the
repo, and tests must run offline.

## Decision

Web search goes through a single **`WebSearch` port** (in
[`@nowlez/contracts`](../../packages/contracts/src/web-search.ts)). Adapters live in
[`@nowlez/web-search`](../../packages/web-search):

- **`FakeWebSearch`** — the default; deterministic and network-free; drives tests.
- **`TavilyWebSearch`** — real search via Tavily, configured from the environment
  (`TAVILY_API_KEY`).
- **`selectWebSearch(kind)`** — the single selector; default `"fake"`.

It is wired into the Munshi via `munshiHandlers({ webSearch })` as the `web_search` tool handler.

## Consequences

- Real web search today, **key from the environment** (never committed); tests and CI use the
  fake, so they never touch a network.
- Same swap-behind-one-selector discipline as
  [ADR-0002](0002-source-agnostic-court-data-interface.md) /
  [ADR-0009](0009-model-client-port.md); a different search provider slots in behind the port.

## Related

- [ADR-0009](0009-model-client-port.md), [`../munshi.md`](../munshi.md),
  [glossary: Tavily](../glossary.md#tavily)
