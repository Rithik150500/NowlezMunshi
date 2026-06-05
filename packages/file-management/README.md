# @nowlez/file-management

**Stub.** The ingestion pipeline: turn any incoming artifact (an order PDF or a
user upload) into something structured and searchable
([docs/file-management.md](../../docs/file-management.md)).

- **Step 1 — normalisation.** Every format becomes **page images** (a vision model
  reads them). The per-format route is fixed and exposed today via
  `planNormalization()`; the actual rendering lands in **Phase 3**.
- **Step 2 — classification.** Page images + case mini-details go to the **smaller
  Gemma** model, which returns the CNR, document type, and a descriptive summary.

Runs on the smaller of the two models
([ADR-0003](../../docs/decisions/0003-two-model-split.md)).
