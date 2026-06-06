# Glossary

Domain terminology used throughout NowLez. Link here rather than re-explaining terms inline.

### Advocate
A lawyer entitled to practise in Indian courts. The intended user of NowLez (individually or
as a small firm).

### Alert-worthy
A change recorded during the [daily refresh](alerts-and-tracking.md) that is significant
enough to **raise a notification**, as opposed to a routine/cosmetic change that updates the
case silently. New orders are always alert-worthy.

### Case
The central entity in NowLez, keyed **solely** by its [CNR](#cnr). Carries the court
hierarchy, case details, and a tracking flag, and owns collections of
[Orders](data-model.md#order) and [Files](data-model.md#file). See
[`data-model.md`](data-model.md).

### Case Mini-Detail / Summary
The compact representation of a case — its order and file summaries — loaded into the
[Munshi's](munshi.md) context so it can reason across the whole caseload without holding
every full document.

### Cause list
The court's published **schedule of cases to be heard that day**. NowLez cross-references the
eCourts cause list against the user's own cases so the advocate sees only the listings that
concern them. See [`case-management.md`](case-management.md#daily-cause-list).

### CNR
**Case Number Record** — the unique identifier eCourts assigns to any registered case. In
NowLez it is the **sole primary key** of a [Case](#case); there is no separate internal
identifier. See [ADR-0001](decisions/0001-cnr-as-sole-primary-key.md).

### Court hierarchy
The selector path that locates a case: **State / High Court → District / Bench → Court**.
Used both when searching and when storing a case.

### DC / District Court
One of the two court tiers NowLez targets.

### docx-js
The JavaScript library the [Munshi](munshi.md) emits code for when drafting a Word document.
The code compiles into a `.docx`, which is then rendered to a PDF preview. See
[`document-handling.md`](document-handling.md#the-docx-generation-pipeline).

### eCourts
India's **national judicial data system** (case details, orders, cause lists). NowLez integrates with
it as one of its two pillars. eCourts exposes **no self-serve public API** for private products
(official APIs — NAPIX, NJDG — exist but are gated to government/authorized partners); see
[`ecourts-integration.md`](ecourts-integration.md).

### File
A document belonging to a [Case](#case), identified by a **File ID**. User-uploaded or
AI-drafted; stored with its original, page images, document type, and a descriptive summary.
See [`data-model.md`](data-model.md#file).

### Gemma 4
Google's open model family that NowLez uses, in two sizes: a **smaller** (vision-capable) model for
the high-volume [File Management](file-management.md) pipeline, and a **larger** model for the
[Munshi](munshi.md). Released March 2026 and licensed **Apache 2.0** (unlike the custom terms on
Gemma 1–3n). See [ADR-0003](decisions/0003-two-model-split.md) and the
[research report](research/2026-06-05-ecourts-gemma-landscape.md).

### HC / High Court
The second of the two court tiers NowLez targets.

### Munshi
NowLez's **AI assistant**, named after the traditional clerk-scribe who keeps a lawyer's
records and prepares drafts. The reasoning/drafting layer. See [`munshi.md`](munshi.md).

### OnlyOffice
The **embedded office suite** used as NowLez's document editor (and for creating new
documents). See [`document-handling.md`](document-handling.md#document-editor).

### Order
A court order belonging to a [Case](#case), identified by an **Order ID**. Fetched from
eCourts; stored with its source PDF, page images, and an order summary. Can arrive
automatically when a tracked case updates. See [`data-model.md`](data-model.md#order).

### Page images
The normalised form every document is converted into so a **vision model** can read it. The
common currency of the [ingestion pipeline](file-management.md).

### QR code
An alternative to typing a [CNR](#cnr) when [adding a case](case-management.md#adding-a-case):
scanning it pulls full case details and retrieves the case's order PDFs.

### Source-agnostic court-data interface
The single seam through which **all** court data enters NowLez, with interchangeable implementations
behind it: a **web-portal scrape** (the path proven by public tooling), the **eCourts mobile-app
backend** (a hypothesis pending validation), and a **commercial API**. See
[ADR-0002](decisions/0002-source-agnostic-court-data-interface.md) and the
[research report](research/2026-06-05-ecourts-gemma-landscape.md).

### Tavily
The provider used to implement the Munshi's **web search** tool. See
[`munshi.md`](munshi.md#the-toolset).

### Tracking
The state of a [Case](#case) that is being refreshed on a daily cycle. See
[`alerts-and-tracking.md`](alerts-and-tracking.md).
