# @nowlez/model

`ModelClient` adapters ([ADR-0009](../../docs/decisions/0009-model-client-port.md)).
The two Gemma models ([ADR-0003](../../docs/decisions/0003-two-model-split.md)) are reached
through the [`ModelClient`](../contracts/src/model.ts) port; callers ask for `"small"`
(ingestion) or `"large"` (Munshi) and never hardcode a model id.

| Adapter | Use |
| --- | --- |
| `FakeModelClient` | Default; deterministic, network-free. Drive it with a responder in tests. |
| `OpenAiCompatibleModelClient` | Real endpoints via `/chat/completions` (self-host vLLM/Ollama/LM Studio, or a hosted provider — incl. Gemini's OpenAI-compat endpoint). |
| `selectModelClient(kind)` | The single selector; `"openai-compatible"` reads config from the environment. |

## Configuration (real endpoint)

`selectModelClient("openai-compatible")` reads:

| Env var | Required | Meaning |
| --- | --- | --- |
| `NOWLEZ_MODEL_BASE_URL` | yes | Base URL incl. version, e.g. `http://localhost:11434/v1` |
| `NOWLEZ_MODEL_SMALL` | yes | Model id for the smaller (ingestion / vision) model |
| `NOWLEZ_MODEL_LARGE` | yes | Model id for the larger (Munshi) model |
| `NOWLEZ_MODEL_API_KEY` | no | Bearer token, if the endpoint needs one |

Keys are read from the environment and **never committed**. Tests and CI use the fake, so
they never touch a network.
