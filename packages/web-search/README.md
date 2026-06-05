# @nowlez/web-search

`WebSearch` adapters ([ADR-0010](../../docs/decisions/0010-web-search-port.md)) — the seam
behind the Munshi's `web_search` tool ([docs/munshi.md](../../docs/munshi.md#the-toolset)).

| Adapter | Use |
| --- | --- |
| `FakeWebSearch` | Default; deterministic, network-free. Drive it with a responder in tests. |
| `TavilyWebSearch` | Real web search via [Tavily](../../docs/glossary.md#tavily). |
| `selectWebSearch(kind)` | The single selector; `"tavily"` reads `TAVILY_API_KEY` from the env. |

The key is read from the environment and **never committed**; tests and CI use the fake, so
they never touch a network. Wire it into the Munshi via `munshiHandlers({ webSearch })`.
