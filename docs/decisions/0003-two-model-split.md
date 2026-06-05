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

## Research update (2026-06-05)

A fact-checked [research report](../research/2026-06-05-ecourts-gemma-landscape.md) (3-vote
adversarial verification, anchored to Google first-party sources) **confirms and strengthens** this
decision:

- **"Gemma 4" is real** — released **Mar 31 2026** (E2B, E4B, 26B-A4B MoE, 31B; a **12B "Unified"**
  variant added Jun 3 2026), built on Gemini 3 research. The spec's reference is valid.
- **Gemma 4 is Apache 2.0 licensed** — a break from the restrictive custom "Gemma Terms of Use" +
  Prohibited Use Policy that still govern Gemma 1/2/3/3n. **Standardising both tiers on Gemma 4 clears
  the licensing open-question**; mixing in Gemma 3/3n re-imposes the custom terms.
- **Vision is covered for the smaller tier** — the smallest image-capable option is **Gemma 4 E2B**
  (or **Gemma 3 4B**); page-image input costs ~256 tokens per 896×896 crop.
- **Still open:** benchmark small-Gemma-4 vision quality against **Qwen-VL** / a dedicated OCR model
  (e.g. **Mistral OCR 3**) on real order pages before locking the ingestion model — Gemma's edge is
  price + Apache-2.0 self-hostability, not top doc-VQA accuracy. Tracked in
  [open questions](../open-questions.md#file-management).

## Related

- [`../architecture.md#two-models-deliberately-matched-to-their-jobs`](../architecture.md#two-models-deliberately-matched-to-their-jobs)
- [`../file-management.md`](../file-management.md), [`../munshi.md`](../munshi.md)
