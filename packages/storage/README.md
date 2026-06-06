# @nowlez/storage

`BlobStore` adapters ([ADR-0014](../../docs/decisions/0014-blob-store.md)) — object storage for
the bytes a [`BinaryRef`](../contracts/src/binary.ts) points at (the "object storage" deferred in
[ADR-0007](../../docs/decisions/0007-persistence-port.md)).

| Adapter | Use |
| --- | --- |
| `InMemoryBlobStore` | Default; process-lifetime store for dev and tests. |
| `FilesystemBlobStore` | Durable — one file per blob under a directory. |
| `selectBlobStore(kind, opts)` | The single selector. |

The Munshi's `write_docx` stores its compiled `.docx` here and records a `BinaryRef` on the
drafted [`File`](../contracts/src/data-model.ts); `read_docx` reads it back.
