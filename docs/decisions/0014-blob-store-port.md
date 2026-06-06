# ADR-0014 — Object storage behind a BlobStore port

**Status:** Accepted (Phase 6)

## Context

[ADR-0007](0007-persistence-port.md) deferred object storage: a
[`BinaryRef`](../../packages/contracts/src/binary.ts) carries a `uri` + `contentType`, and the
bulk bytes it points at (source PDFs, rendered page images, and now the `.docx` produced by
the Munshi's `write_docx`) were always meant to live in **object storage behind a future
`BlobStore` port**, not inlined in the case record.

`write_docx` makes this concrete: it compiles docx-js code to a `.docx`
([ADR-0012](0012-docx-sandbox.md)) that must be **stored** and later **read back**
(`read_docx`, via [Mammoth](../document-handling.md)). The bytes need a home that is durable in
production yet needs no external infrastructure for tests/CI.

## Decision

A **`BlobStore` port** (in [`@nowlez/contracts`](../../packages/contracts/src/storage.ts)):
`put(bytes, contentType) → BinaryRef` and `get(ref) → bytes`. Adapters live in
[`@nowlez/storage`](../../packages/storage):

- **`InMemoryBlobStore`** — the default; process-lifetime `Map` for dev and tests.
- **`FilesystemBlobStore`** — durable, dependency-free; one file per blob under a directory.
- **`selectBlobStore(kind, opts)`** — the single selector.

A `BinaryRef` is the **handle**; the store owns the bytes. `write_docx` calls `put` and attaches
an **AI-drafted [`FileDocument`](../data-model.md#file)** (`origin: "ai-drafted"`) to the
case via the `CaseRepository`; `read_docx` resolves the `FileDocument`'s `original` ref through
`get`. The composition roots ([`apps/cli`](../../apps/cli), [`apps/server`](../../apps/server))
wire a `FilesystemBlobStore` under the same data dir as the case store, so a draft survives a
restart and is readable again.

## Consequences

- **Durable storage today** (file-backed) with **zero new dependencies**; CI stays green and
  fast on the in-memory default — same seam discipline as the `CaseRepository`.
- `write_docx`/`read_docx` depend only on the **port**, so swapping to **S3/GCS/Azure Blob** is a
  new adapter + selector case — nothing ripples outward.
- The case record stays **lean** (refs, not bytes); large content never bloats the JSON store.
- Open: content-addressing/dedup, lifecycle/GC of orphaned blobs, signed URLs, and access
  control are deferred ([open questions](../open-questions.md#data-model)).

## Alternatives considered

| Option | Verdict | Reason |
| --- | --- | --- |
| Port + in-memory & filesystem adapters | **Chosen** | Durable now, zero deps, cloud store deferred behind the port. |
| Inline bytes in the `BinaryRef`/case record | Rejected | Bloats the case store; defeats the ref indirection ADR-0007 set up. |
| Commit to an S3 SDK now | Deferred | Network + credentials in CI; premature before deployment is settled. |

## Related

- [ADR-0007](0007-persistence-port.md), [ADR-0012](0012-docx-sandbox.md)
- [`../document-handling.md`](../document-handling.md), [`../data-model.md`](../data-model.md#file),
  [`../contracts.md`](../contracts.md), [open questions](../open-questions.md#data-model)
