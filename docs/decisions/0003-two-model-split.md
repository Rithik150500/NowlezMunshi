# ADR-0003 — Two Gemma 4 models, split by job

**Status:** Accepted (agreed in specification)

## Context

NowLez has two very different AI workloads:

- **File Management** ([ingestion](../file-management.md)) processes a **high volume** of
  documents. The dominant concern is **cost per document**.
- The **[Munshi](../munshi.md)** is a conversational, tool-calling agent. The dominant
  concern is **reasoning quality**, and per-call cost matters less.

## Decision

Use **two distinct [Gemma 4](../glossary.md#gemma-4) models**, each matched to its job:

| Model | Used by | Optimised for |
| --- | --- | --- |
| **Smaller Gemma 4** | File Management pipeline | **Cost per document** (high volume) |
| **Larger Gemma 4** | AI Munshi | **Reasoning quality** (per-call cost secondary) |

## Consequences

- **Cost control where volume is.** The high-frequency path runs on the cheaper model.
- **Quality where reasoning is.** The user-facing assistant runs on the more capable model.
- **Two models to operate.** Slightly more operational surface (two deployments/configs) than
  a single-model design — accepted as the price of matching each model to its job.
- **Shared family.** Both are Gemma 4, so tooling, prompting conventions, and infrastructure
  can be largely shared.

## Alternatives considered

- **One model for everything.** Either overpays on the high-volume ingestion path (if large)
  or underperforms on assistant reasoning (if small). Rejected.

## Open items

- Concrete sizes/quantisation and hosting (self-host vs. hosted) for each model — see
  [open questions](../open-questions.md#munshi).

## Related

- [`../architecture.md#two-models-deliberately-matched-to-their-jobs`](../architecture.md#two-models-deliberately-matched-to-their-jobs)
- [`../file-management.md`](../file-management.md), [`../munshi.md`](../munshi.md)
