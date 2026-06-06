# @nowlez/cli

The NowLez command-line entrypoint — a thin **composition root** that wires the engine (the
court-data source, a durable store, the model, web search) and runs it.

```bash
pnpm cli add-case KLER010012342026     # add a case by CNR (persisted under .nowlez/)
pnpm cli cases                          # list added cases
pnpm cli cause-list 2026-06-20          # the day's cause list for your tracked cases
pnpm cli refresh                        # refresh tracked cases; show any new alerts
pnpm cli munshi "Summarise my latest order"
pnpm cli check-model                    # probe the configured Gemma 4 endpoint
```

- **Court data** uses the mock source for now; cases persist as JSON under `.nowlez/`
  (override with `NOWLEZ_DATA_DIR`), so state survives across invocations.
- **Models**: without `NOWLEZ_MODEL_*` the Munshi prints a labelled stub; set them (see
  [`.env.example`](../../.env.example) /
  [ADR-0009](../../docs/decisions/0009-model-client-port.md)) to use your **Gemma 4**
  endpoint. Set `TAVILY_API_KEY` for web search
  ([ADR-0010](../../docs/decisions/0010-web-search-port.md)).

Tests and CI use fakes, so they never need a model, a key, or a network.
