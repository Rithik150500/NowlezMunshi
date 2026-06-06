# ADR-0006 — TypeScript monorepo (pnpm) as the stack

**Status:** Accepted (Phase 1 — resolves the stack open question)

## Context

[Phase 0](../roadmap.md#phase-0--foundation) deliberately left the technology stack
undecided ([open questions](../open-questions.md#stack--platform)), and the
[Phase 1 scaffold](../roadmap.md#phase-1--scaffold) was blocked on it. NowLez spans a
backend/engine (case management, ingestion orchestration, the Munshi agent loop), a
three-pane [web app](../interfaces.md#web-application), a
[mobile app](../interfaces.md#mobile-application), a [WhatsApp](../interfaces.md#whatsapp)
channel, and a [document pipeline](../document-handling.md). The two
[Gemma models](../decisions/0003-two-model-split.md) and [Tavily](../glossary.md#tavily)
are reached over HTTP. The candidates discussed were **Python** (e.g. FastAPI) and
**TypeScript/Node**.

## Decision

Build NowLez as a **TypeScript** monorepo managed by **pnpm workspaces**.

- **Typecheck:** `tsc` (strict). **Lint + format:** Biome. **Tests:** Vitest. **CI:** GitHub Actions.
- **Topology:** the four layers, the [contracts](../contracts.md), and the
  [court-data seam](../ecourts-integration.md) are packages under `packages/`; the three
  front-ends are apps under `apps/` (Phase 7).

## Consequences

- **One language across the whole surface.** The engine, the web app, the (React Native)
  mobile app, and the document pipeline all share TypeScript — and the document pipeline is
  **JS-native**: [docx-js](../glossary.md#docx-js) is a JavaScript library and the Munshi
  *emits docx-js code that must execute in a JS runtime*
  ([ADR-0005](0005-onlyoffice-and-docx-js.md)); [OnlyOffice](../glossary.md#onlyoffice)
  integrates via JS. A TS engine runs that emitted code without a language bridge.
- **The model calls don't pull toward Python.** Gemma (both sizes) and Tavily are HTTP
  APIs callable from any language; nothing trains or runs a model in-process, so Python's
  ML-ecosystem edge is marginal here.
- **Shared types end to end.** [`@nowlez/contracts`](../contracts.md) gives the backend,
  web, and mobile a single compile-time source of truth for the data model, the
  `CourtDataSource` interface, and the Munshi tool schemas.
- **Cost (accepted).** TypeScript's data/ML libraries are thinner than Python's. If a
  future component genuinely needs Python (e.g. a self-hosted vision-model server), it can
  sit behind an HTTP boundary without changing this decision.

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| **TypeScript monorepo** | **Chosen** | One language across engine + web + mobile + the JS-native docx pipeline; models are HTTP. |
| Python (FastAPI) + separate JS front-ends | Rejected as default | Splits the codebase into two languages and toolchains, and puts a language boundary between the Munshi and the docx-js code it must run; its ML upside is blunted because models are hosted behind APIs. |
| Polyglot per component | Rejected (for now) | Maximises operational surface for no clear gain at solo-advocate / small-firm scale. |

## Notes

- This resolves the **backend-language** open question. The **web** and **mobile** framework
  choices remain open ([open questions](../open-questions.md#stack--platform)), though both
  now default to the TypeScript ecosystem.
- Internal packages export TypeScript source directly (`exports: "./src/index.ts"`); a
  bundling/emit step is introduced when an app first consumes a package (Phase 2+).

## Related

- [`../architecture.md`](../architecture.md), [`../roadmap.md`](../roadmap.md),
  [`../contracts.md`](../contracts.md)
- [ADR-0005](0005-onlyoffice-and-docx-js.md) — the docx-js pipeline this stack runs natively.
