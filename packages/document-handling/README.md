# @nowlez/document-handling

**Stub.** How documents are read, edited, and rendered everywhere in the product
([docs/document-handling.md](../../docs/document-handling.md)). Cross-cutting —
used throughout, not a pipeline stage.

- **Viewer** — PDF, doc/docx, and images, for both Orders and Files.
- **Editor** — [OnlyOffice](../../docs/glossary.md#onlyoffice), embedded; also where
  *Create New document* opens a blank doc.
- **Web viewer** — opens a cited URL inside the app.
- **docx pipeline** — docx-js code -> `.docx` -> **PDF preview**
  ([ADR-0005](../../docs/decisions/0005-onlyoffice-and-docx-js.md)), the same
  rendering the ingestion pipeline uses for uploaded Word files.

The viewer/editor and the docx pipeline land in **Phase 5**.
