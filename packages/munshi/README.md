# @nowlez/munshi

**Stub.** The AI assistant: the reasoning and drafting engine
([docs/munshi.md](../../docs/munshi.md)). Runs on the **larger** Gemma model
([ADR-0003](../../docs/decisions/0003-two-model-split.md)).

- **Context assembly** — case mini-details across *all* the user's cases, plus the
  behavioural instructions.
- **Tool-calling loop** — the six tools (`read`, `web_search`, `read_docx`,
  `write_docx`, `ask_user_question`, `full_case_details`). Their input schemas and
  derived JSON Schemas come from [`@nowlez/contracts`](../contracts) and are exposed
  today via `tools()`.
- **Inline-citation discipline** — every claim cited to a CNR, an Order/File ID +
  page, or a URL.

The loop and citation enforcement land in **Phase 4**.
