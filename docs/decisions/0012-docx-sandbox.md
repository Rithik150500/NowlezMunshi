# ADR-0012 — Executing docx-js in a sandbox (write_docx)

**Status:** Accepted (Phase 5) — with a security caveat

## Context

The Munshi's [`write_docx` tool](../munshi.md#the-toolset) takes **model-emitted docx-js code**
and compiles it to a `.docx` ([ADR-0005](0005-onlyoffice-and-docx-js.md)): the code builds a
`docx.Document`, which is packed to bytes. **Executing model-generated JavaScript** is the
security-sensitive heart of this.

## Decision

Compilation goes through a **`DocxCompiler` port** (in
[`@nowlez/contracts`](../../packages/contracts/src/docx.ts)). The default adapter,
**`NodeVmDocxSandbox`** ([`@nowlez/document-handling`](../../packages/document-handling)),
executes the code with **`node:vm`**: it runs in a fresh context whose only global is the
injected `docx` library, under a wall-clock **timeout**, and must `return` a `docx.Document`;
the host then packs it (`docx.Packer`) into `.docx` bytes.

## Security caveat (important)

`node:vm` restricts **scope** (no `require`, `process`, or module locals) and bounds runtime,
but it is **NOT a security boundary** against deliberately malicious code — V8's documentation
is explicit. For genuinely untrusted input in production, the `DocxCompiler` port must be backed
by a **real isolate** (`isolated-vm`) or a **locked-down worker thread** (separate thread/process,
no module access, CPU/memory limits). The port keeps that swap local. Until then, treat docx-js
execution as **semi-trusted** and do not expose it to arbitrary third parties.

## Consequences

- `write_docx` works today: real docx-js → a real `.docx` (a zip), then a PDF preview via the
  [`DocumentRenderer`](0008-document-renderer-port.md).
- Tested deterministically — a snippet → a `PK` zip; non-`Document` rejected; runaway code
  hits the timeout.
- The hardening path (`isolated-vm` / worker) is a drop-in behind the port; tracked in
  [open questions](../open-questions.md#document-handling).

## Related

- [ADR-0005](0005-onlyoffice-and-docx-js.md), [ADR-0008](0008-document-renderer-port.md),
  [`../document-handling.md`](../document-handling.md), [`../munshi.md`](../munshi.md)
