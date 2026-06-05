# @nowlez/cli

The NowLez command-line entrypoint — a thin **composition root** that wires the engine to a
model and runs it.

```bash
pnpm cli munshi "Summarise the latest order in my cases"
pnpm cli check-model    # probe the configured endpoint (one line per model)
```

Without model env vars it prints a clearly-labelled **stub** reply, so it runs offline. Set
these to use your **Gemma 4** endpoint (see [`.env.example`](../../.env.example) and
[ADR-0009](../../docs/decisions/0009-model-client-port.md)):

| Env var | Example |
| --- | --- |
| `NOWLEZ_MODEL_BASE_URL` | `http://localhost:11434/v1` |
| `NOWLEZ_MODEL_SMALL` | the smaller Gemma 4 model id |
| `NOWLEZ_MODEL_LARGE` | the larger Gemma 4 model id |
| `NOWLEZ_MODEL_API_KEY` | only if your endpoint requires it |

> The Munshi currently runs a single **cited round-trip**; the multi-turn tool-loop lands as
> its tool handlers (web search → Tavily, write docx) come online.
