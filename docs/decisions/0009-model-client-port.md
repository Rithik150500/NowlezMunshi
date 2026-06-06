# ADR-0009 — Reach the Gemma models through a ModelClient port

**Status:** Accepted (Phase 3 / 4)

## Context

The two Gemma models ([ADR-0003](0003-two-model-split.md)) — the **smaller** for ingestion
classification, the **larger** for the Munshi — must be reachable by the engine. Hosting
(self-host vs. hosted), the endpoint, and the exact model ids are deployment choices the
owner makes, and **secrets must never be committed**. The test suite must stay green without
a network or credentials.

## Decision

All model access goes through a single **`ModelClient` port** (in
[`@nowlez/contracts`](../../packages/contracts/src/model.ts)): callers ask for `"small"` or
`"large"` and never hardcode a model id. Adapters live in
[`@nowlez/model`](../../packages/model):

- **`FakeModelClient`** — the default; deterministic and network-free; drives tests.
- **`OpenAiCompatibleModelClient`** — real endpoints via `/chat/completions`, configured from
  the environment (`NOWLEZ_MODEL_BASE_URL`, `NOWLEZ_MODEL_SMALL`, `NOWLEZ_MODEL_LARGE`,
  optional `NOWLEZ_MODEL_API_KEY`). Works with self-hosted servers (vLLM, Ollama, LM Studio)
  and hosted providers — including Gemini's OpenAI-compatibility endpoint.
- **`selectModelClient(kind)`** — the single selector; default `"fake"`.

The smaller model is wired into [`IngestionPipeline.classify`](../file-management.md); the
larger into [`Munshi.run`](../munshi.md).

## Consequences

- **Real model access today** via an env-driven adapter, with **no secrets in the repo**;
  tests and CI use the fake, so they never touch a network.
- **OpenAI-compatible is a broad default** covering self-host + most hosts + Gemini's compat
  endpoint; a native Gemini (or other) adapter slots in behind the same port if ever needed.
- Engine code depends only on the port and the `"small"` / `"large"` abstraction
  ([ADR-0003](0003-two-model-split.md)), never on a provider — the same seam discipline as
  [ADR-0002](0002-source-agnostic-court-data-interface.md).
- `Munshi.run` is currently a single **cited round-trip**; the multi-turn **tool-execution
  loop** and the individual tool handlers (web search → [Tavily](../glossary.md#tavily) key;
  write docx → docx execution, Phase 5) are the remaining work.

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Port + fake & OpenAI-compatible adapters | **Chosen** | Real, env-driven, secret-free; tests stay offline. |
| Hardcode a provider SDK in the engine | Rejected | Couples the engine to one provider (cf. ADR-0002). |
| Commit a default endpoint / key | Rejected | Never commit secrets. |

## Related

- [ADR-0003](0003-two-model-split.md), [`../file-management.md`](../file-management.md),
  [`../munshi.md`](../munshi.md), [open questions](../open-questions.md#munshi)
