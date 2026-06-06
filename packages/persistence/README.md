# @nowlez/persistence

`CaseRepository` adapters ([ADR-0007](../../docs/decisions/0007-persistence-port.md)).
The rest of NowLez persists cases through the
[`CaseRepository`](../contracts/src/persistence.ts) port; the concrete engine is
deferred behind it.

| Adapter | Use |
| --- | --- |
| `InMemoryCaseRepository` | Default; process-lifetime store for dev and tests. |
| `FileCaseRepository` | Durable, dependency-free JSON file store for the MVP. |
| `selectCaseRepository(kind, opts)` | The single selector — swap stores by changing `kind`. |

The recommended production engine is **SQLite**, added behind the same port when
indexed queries / concurrency are needed; bulk binary content (PDFs, page images)
will live in object storage behind a future `BlobStore` port, referenced from a
[`BinaryRef`](../contracts/src/binary.ts). See ADR-0007.
