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

The same in-memory + file pattern (and a `select…` helper) backs the
[`AlertStore`](../contracts/src/alert-store.ts) ([ADR-0015](../../docs/decisions/0015-alert-store-and-delivery.md)),
the [`ClientRepository`](../contracts/src/client.ts)
([ADR-0017](../../docs/decisions/0017-clients-local-entity.md)), and the
[`DeadlineStore`](../contracts/src/deadline.ts)
(`InMemoryDeadlineStore` / `FileDeadlineStore` / `selectDeadlineStore`,
[ADR-0018](../../docs/decisions/0018-deadlines-and-limitation.md)), and the **identity** stores —
`UserRepository`, `FirmRepository`, and `SessionStore`
([ADR-0019](../../docs/decisions/0019-auth-and-identity.md); in-memory + file).

The recommended production engine is **SQLite**, added behind the same port when
indexed queries / concurrency are needed; bulk binary content (PDFs, page images)
will live in object storage behind a future `BlobStore` port, referenced from a
[`BinaryRef`](../contracts/src/binary.ts). See ADR-0007.
