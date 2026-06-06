# @nowlez/munshi

The AI assistant: the reasoning and drafting engine
([docs/munshi.md](../../docs/munshi.md)). Runs on the **larger** Gemma model
([ADR-0003](../../docs/decisions/0003-two-model-split.md)).

## Status

- ✅ **Toolset** — `tools()` returns the six tool definitions (`read`, `web_search`,
  `read_docx`, `write_docx`, `ask_user_question`, `full_case_details`) with input schemas +
  derived JSON Schemas from [`@nowlez/contracts`](../contracts).
- ✅ **Context assembly** — `assembleContext(miniDetails, instructions?)` builds the context
  package (mini-details across all cases + behavioural instructions; a sensible, overridable
  `DEFAULT_MUNSHI_INSTRUCTIONS` is provided). `toMiniDetail` (in contracts) derives a case's
  mini-detail.
- ⏳ **Tool-calling loop** (`run`) and **inline-citation enforcement** — land in **Phase 4**,
  once a Gemma model endpoint is wired.
