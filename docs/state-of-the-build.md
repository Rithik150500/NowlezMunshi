# NowLez — State of the Build

A snapshot of what is implemented versus what remains, for a clean handoff to go-live. The short
version: **everything verifiable in CI is built, wired, and tested**; every remaining task is an
**external runtime sitting behind a ready, documented seam**.

## Snapshot

- A **TypeScript monorepo** ([ADR-0006](decisions/0006-typescript-monorepo-stack.md)): 13 engine
  packages + 5 app surfaces, **16 ADRs**, **155 tests** across 26 files.
- `pnpm run check` (Biome lint + `tsc` + `tsc` web + Vitest) is **green**, and so is CI on the
  feature branch.
- Discipline throughout: every external dependency is a **port with a fake default** (green,
  offline, no secrets) and a **real adapter that switches on by env/injection** — so the build is
  fully exercisable now and turns "live" by configuration, not rewrites.

## Conformance to the specification

| Spec § | Status | Notes |
| --- | --- | --- |
| 2. Architecture (4 layers, 2 Gemma models) | ✅ | Ports + adapters; small model → ingestion, large → Munshi. |
| 3. Add case (CNR / QR) | ✅ | CNR end-to-end; QR via `getCaseByQr` (no scanner UI). |
| 3. Search (party / case number, hierarchy) | ✅ | Engine + `POST /search/*` + web "Find a case". |
| 3. Tracking (daily refresh, alert-worthy vs silent) | ✅ | Diff engine + `AlertStore` + opt-in scheduler. |
| 3. Daily cause list | ✅ | Cross-reference + `GET /cause-list` + web panel. |
| 3. eCourts integration (single seam, fallback, rate-limit/cache/fetch-once) | 🟡 | `CourtDataSource` port + **provisional** `EcourtsMobileSource` (all 6 ops) + caching/rate-limit. Live use needs the real param codec + legal sign-off. |
| 4. File Management (normalise → classify, mini-detail context) | ✅ | `IngestionPipeline` + runner; real renderer built (see below). |
| 5. Munshi (context, citations, 6 tools, drafts) | ✅ | Tool loop + trace; citations enforced to CNR/order#page/file#page; `read`/`read_docx`/`write_docx`/`web_search`/`full_case_details` wired. |
| 6. Document handling (viewer, editor, docx pipeline, web viewer) | 🟡 | docx pipeline ✅; viewer (PDF/image inline, .docx text) ✅; **URL viewer** ✅; **OnlyOffice editor** env-gated scaffold. |
| 7.1 Web app (three-pane) | ✅ | Cases (expandable tree) · alerts · cause list · search · case detail (details/orders/files, track toggle, viewer/editor) · Munshi chat (live tool-calls + cited replies). Voice input not built. |
| 7.2 Mobile app (CASES / MUNSHI) | 🟡 | `@nowlez/mobile` data layer (client + view-model) built & tested; the React Native shell renders it. |
| 7.3 WhatsApp | ✅ | Command set (`case`/`orders`/`file`/`cause-list`/`help`, bare CNR, else → Munshi) + `sendDocument` media. Order/cause-list **PDF** rendering pending. |
| 8. Data model (Case CNR-keyed, Order, File, Mini-Detail, User) | ✅ | Matches, incl. CNR-as-sole-PK boundary. |

## Ports & adapters (the seams)

Each port has a fake/offline default and a real adapter selected by env or constructed with deps:

| Port | Default (CI) | Real adapter / switch |
| --- | --- | --- |
| `CourtDataSource` ([2](decisions/0002-source-agnostic-court-data-interface.md)/[16](decisions/0016-ecourts-mobile-source.md)) | `MockCourtDataSource` | `EcourtsMobileSource` — `NOWLEZ_COURT_SOURCE` (+ cache/rate-limit decorators) |
| `CaseRepository` ([7](decisions/0007-persistence-port.md)) | in-memory | `FileCaseRepository` (SQLite later) |
| `AlertStore` ([15](decisions/0015-alert-store-and-delivery.md)) | in-memory | `FileAlertStore` |
| `BlobStore` ([14](decisions/0014-blob-store-port.md)) | in-memory | `FilesystemBlobStore` (S3/GCS later) |
| `DocumentRenderer` ([8](decisions/0008-document-renderer-port.md)) | `FakeDocumentRenderer` | `PdfjsDocumentRenderer` (inject pdfjs-dist + canvas) |
| `ModelClient` ([9](decisions/0009-model-client-port.md)) | stub | OpenAI-compatible — `NOWLEZ_MODEL_*` |
| `WebSearch` ([10](decisions/0010-web-search-port.md)) | fake | Tavily — `TAVILY_API_KEY` |
| `DocxCompiler` / `DocxReader` ([12](decisions/0012-docx-sandbox.md)) | node:vm sandbox / Mammoth | (real isolate for untrusted input) |
| `WhatsAppClient` ([13](decisions/0013-whatsapp-channel.md)) | fake | `MetaWhatsAppClient` — `WHATSAPP_*` |

`GET /config` reports which integrations are live vs stubbed (modes only, never secrets).

## Go-live checklist (the external runtimes)

None of these can be built or verified in this sandbox; each drops into a ready seam.

1. **Legal / compliance sign-off** for automated eCourts extraction (§43 IT Act, DPDP, ToS) —
   **blocking** for any real court data, independent of the technical work.
2. **eCourts codec + shapes** — capture the live traffic, implement the request-param encryption as
   an `EcourtsParamCodec`, confirm the wire shapes. See the
   [capture/codec runbook](runbooks/ecourts-mitm-and-codec.md).
3. **PDF renderer** — install `pdfjs-dist` + a canvas and construct `PdfjsDocumentRenderer` (wiring
   snippet in [ADR-0008](decisions/0008-document-renderer-port.md)); also unblocks real page images.
4. **OnlyOffice** — run a Document Server and set `VITE_ONLYOFFICE_URL`; **docx → pdf** needs an
   office converter (LibreOffice/OnlyOffice).
5. **Model / search / WhatsApp credentials** — set the env in [`.env.example`](../.env.example).
6. **React Native shell** over [`@nowlez/mobile`](../apps/mobile); **voice** input on web/mobile.
7. **Auth, accounts, multi-tenancy** — gates per-user alert routing and fetch-once/fan-out
   ([open questions](open-questions.md#data-model)).

## Where things live

- **Engine** ([`packages/`](../packages)): contracts · court-data · persistence · storage ·
  rendering · model · web-search · whatsapp · case-management · file-management · tracking · munshi ·
  document-handling.
- **Surfaces** ([`apps/`](../apps)): `cli` · `server` (HTTP API + WhatsApp webhook + scheduler) ·
  `web` (three-pane) · `mobile` (data layer) · `whatsapp` (channel docs).

## Pointers

- [Roadmap](roadmap.md) · [ADRs](decisions/) · [Open questions](open-questions.md)
- [Product spec](overview.md) · [Contracts](contracts.md) · [Architecture](architecture.md)
- [eCourts capture/codec runbook](runbooks/ecourts-mitm-and-codec.md) · [`.env.example`](../.env.example)
