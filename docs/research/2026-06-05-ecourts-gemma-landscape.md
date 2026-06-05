# eCourts Access, Gemma Models & the Indian Legal-Tech Landscape

**Date:** 2026-06-05
**Method:** 5-angle fan-out web research → 15+ fetched primary/secondary sources → 20 falsifiable
claims → **3-vote adversarial verification** (independent-source, primary-source, and skeptic
stances; a claim dies only on ≥2/3 refutes).
**Result:** All three verifiers returned. **Zero claims refuted.** Every claim was SUPPORTED by
all three except one unprovable negative (V13), which all three marked UNCERTAIN.
**Caveat:** This report's author has a knowledge cutoff of January 2026, so every **post-cutoff**
claim (the Gemma 4 release; the Feb-2026 Supreme Court matter) was treated as extraordinary and
anchored to **first-party** sources (Google/Mistral/court), deliberately ignoring the AI-generated
SEO content that clusters around these topics.

---

## Bottom line

1. **The AI half is more viable than the spec assumed.** "Gemma 4" is real (Mar–Apr 2026) and —
   importantly — **Apache 2.0 licensed**, which removes the restrictive custom-license overhang of
   Gemma 3/3n. Vision-capable small models exist for the ingestion tier. → strengthens
   [ADR-0003](../decisions/0003-two-model-split.md).
2. **The eCourts half is shakier than the spec assumed.** There is **no self-serve official API**
   for a private product, and — contrary to the spec's central premise — **no public evidence that
   the mobile-app API is an un-CAPTCHA'd path**. Every working tool scrapes the **web portal** and
   OCR-solves its CAPTCHA. → reframes [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md)
   and *vindicates* the source-agnostic interface ([ADR-0002](../decisions/0002-source-agnostic-court-data-interface.md)).
3. **The market is crowded but fragmented**, and `nowlez.com` is already a live product (the
   operator's own). Differentiation must be sharp; a **Feb-2026 Supreme Court matter on
   AI-fabricated citations** is a genuine tailwind for the citation-grounded design.

---

## 1. eCourts data access — the feasibility crux

**No self-serve official API exists for a private legaltech product.** Official APIs *do* exist —
NIC's **NAPIX** exchange, the **NJDG** "Open API", and state programs such as **Kerala DigiCourt**
(which has a formal *API Requisition Form* and *API Sharing Policy*) — but every authoritative
source gates access to **government departments / law-enforcement / "authorized partners."** No
normal onboarding route for a product like NowLez was found. *(Confidence: **High**.)*

**The proven real-world path is web-portal scraping + CAPTCHA-OCR, not a special mobile API.** The
two actively-maintained open-source toolkits — `openjustice-in/ecourts` (GPL) and
`iamshouvikmitra/bharat-courts` (MIT, **v0.3.0, May 2026**) — both hit the public web portals
(`services.ecourts.gov.in/ecourtindia_v6`, `hcservices.ecourts.gov.in`) and defeat a 5–6-character
image CAPTCHA with OCR (`ddddocr`, ~75%/retry), handling the rotating `app_token`/`__csrf_magic`
session scheme. `bharat-courts`' own README states *"there's no official API."* *(Confidence: **High**.)*

**⚠️ The spec's mobile-app premise is unverified.** [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md)
rests on *"the mobile app's API is not CAPTCHA-guarded, unlike the web portal."* Research found **no
public teardown of the eCourts Android app's native API at all**, and **no evidence either way** about
device-integrity attestation (Play Integrity / SafetyNet) on it — this was the single claim all three
verifiers marked **UNCERTAIN** (you cannot prove a negative). The premise is therefore **not false, but
currently unsubstantiated by any public source**; the documented, proven path is the web portal.
*(Confidence: **Low** on the premise → treat as a hypothesis to test.)*

**Commercial fallbacks exist but are all scraper-backed resellers, not authorized feeds.**
`ecourtsindia.com` (REST API, credit-based, explicitly *"re-scrapes official servers"*), **Surepass**,
**AuthBridge** (~15-day-refresh database, not real-time), an **Apify** actor (~$4.99/1,000 results),
and `akshit.me` → `court-api.kleopatra.io` all disclaim government association. None offer *both*
authorized access *and* real-time freshness. *(Confidence: **High**.)*

**Legal exposure is real and unsettled.** Automated extraction of publicly-available data may implicate
**§43 of the IT Act, 2000**, alongside DPDP considerations — independent of the low technical barrier.
*(Confidence: **Med**.)*

### Implications for the repo
- **[ADR-0002](../decisions/0002-source-agnostic-court-data-interface.md) is strongly vindicated** —
  the uncertainty around the mobile path is exactly why that seam matters.
- **[ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md) is reframed** (see its dated
  *Research update*): mobile-app-as-primary is a **hypothesis to validate empirically**, with
  **web-portal-scrape as the proven default**, not merely a fallback.
- The **compliance** and **mobile-API-verification** items in
  [open-questions.md](../open-questions.md#ecourts-integration) are elevated.

## 2. Gemma models — good news, with a licensing upside

**"Gemma 4" is real — the spec's reference is valid.** Released **Mar 31 2026** (announced ~Apr 2),
built on Gemini 3 research. The initial drop was **four** sizes — **E2B, E4B, 26B-A4B (MoE, ~3.8B
active), 31B**; a **12B "Unified" (encoder-free, native audio)** model was added **Jun 3 2026**.
*(Verified against `ai.google.dev/gemma/docs/releases`, `ai.google.dev/gemma/docs/core/model_card_4`,
`blog.google` — not the surrounding SEO blogspam. Confidence: **High**.)*

**Licensing is the headline: Gemma 4 is Apache 2.0** — a deliberate break ("first in the Gemmaverse")
from the restrictive custom **"Gemma Terms of Use" + Prohibited Use Policy** that still govern
**Gemma 1/2/3/3n**. Standardising the whole pipeline on Gemma 4 gives clean commercial rights;
mixing in Gemma 3/3n re-imposes the custom terms. *(Source: `opensource.googleblog.com` Apache-2.0
announcement. Confidence: **High**.)*

**Vision for the ingestion tier is covered.** Page-image input needs a multimodal model:
**Gemma 3** is vision-capable at **4B/12B/27B** (1B is text-only; smallest vision = **4B**, via SigLIP,
**~256 tokens per 896×896 crop** + "Pan & Scan" extra crops for dense pages); **Gemma 3n** (E2B/E4B)
and **all Gemma 4** sizes are multimodal. So the "small vision Gemma" floor is **Gemma 4 E2B** or
**Gemma 3 4B**. *(Confidence: **High**.)*

**Cost / hosting:**
- Google's own Gemini API serves **Gemma on the free tier only (no paid per-token SKU)** — unsuitable
  for production volume. Paid serving = **self-host** (Vertex per-GPU-hour; weights are free) or
  **third parties** (DeepInfra / OpenRouter ≈ **$0.02–0.08/M input**, more on output and larger sizes —
  e.g. Gemma 3 12B ≈ $0.04 in / $0.13 out; 27B ≈ $0.10 in / $0.20 out). *(Confidence: **High**; the
  "$0.02–0.08" band describes input/low-end only.)*
- **Hosted small-Gemma vision processing is plausibly < $0.05 per 1,000 pages**; self-hosting a 4B on
  an L4/4090 wins only at sustained scale. *(Confidence: **Med** — derived, no published 4B throughput.)*
- **Alternatives worth a bake-off:** for *pure OCR*, **Mistral OCR 3** (~**$2/1,000 pages**, Dec 2025)
  and **Qwen2.5-VL** (DocVQA ~95.7 vs Gemma 3 27B ~86.6) beat Gemma on document-text accuracy; for the
  *assistant* tier, **Gemini 2.5 Flash-Lite** is a cheap closed option. Gemma's edge is price +
  Apache-2.0 self-hostability, not raw doc-VQA quality. *(Confidence: **Med**.)*

### Implications for the repo
- **[ADR-0003](../decisions/0003-two-model-split.md) holds** and is annotated with a dated
  *Research update*: Gemma 4 confirmed, **Apache 2.0** resolves the licensing question.
- New [open question](../open-questions.md#file-management): benchmark small-Gemma-4 vision against
  Qwen-VL / a dedicated OCR model on *real* order pages before locking the ingestion model.

## 3. Competitive landscape & differentiation

The Indian solo-advocate space is **crowded but fragmented** — the three capabilities NowLez fuses are
mostly sold *separately*:

| Segment | Players | eCourts auto-track | AI drafting | WhatsApp |
| --- | --- | :--: | :--: | :--: |
| **Solo, eCourts-native** | **Case Bench**, **Lexshastra**, JuniorLawyer, eCourtsIndia, MyAdvoMate | ✅ | ✅ | ⚠️ partial |
| **Firm / enterprise** | Provakil (~19k forums), MikeLegal, Legistify, Manupatra MyKase | ✅ | ⚠️ | ⚠️ |
| **Research / drafting-first** | jhana.ai, CaseMine, SCC/Lexis+ AI | ❌ | ✅ | ❌ |
| **WhatsApp assistants** | NyayAssist, VIDUR, VirtualVakil | ❌ | ✅ | ✅ |

Representative specifics (verified): **Case Bench** — CNR auto-fetch + daily cause list on
WhatsApp+email + AI drafting, ₹1,499–3,999/mo. **Lexshastra** — CNR import + AI from ₹250/mo,
Android-first. **Provakil** — ~19,000 forums, cause lists to WhatsApp/email, corporate-positioned.
**jhana.ai** — $1.6M seed led by Together Fund (Sept **2024**).

### The open gaps NowLez can target
1. **One solo-priced product** unifying deep eCourts tracking **+** grounded drafting **+** a
   conversational assistant — rivals each miss a leg.
2. **A WhatsApp "Munshi" wired to the user's *own* tracked cases** ("what's my next hearing / draft a
   reply for case X") — today WhatsApp is either one-way cause-list delivery *or* generic Q&A.
3. **Citation-grounded, hallucination-safe drafting** — directly answers the regulatory pressure
   below; most rivals' "AI drafting" does not emphasise page-linked citations.
4. **End-to-end order intelligence** — auto-pull new order → OCR → summarise → push into the case
   file / WhatsApp — exists only piecemeal elsewhere.

### Regulatory tailwind (framed precisely)
In **Feb 2026**, the Supreme Court (in `2026 SCC OnLine SC 341`, dated **27 Feb 2026**) flagged that a
**trial-court order built on four non-existent (AI-hallucinated) judgments** could attract "misconduct,
[and] legal consequences shall follow." The broader *"advocates can face professional-misconduct
action"* framing comes via the **Bar Council of India's** position to Parliament and the SC seeking
BCI/AG responses — **not** a direct SC holding penalising a lawyer. Net: citation-grounding is a real,
authoritative tailwind; describe it as *"the SC and BCI are actively treating fabricated AI citations
as a discipline risk,"* not *"the SC held that lawyers commit misconduct."* *(Confidence: **High** on
the matter's existence; **Med** on the advocate-discipline extension.)*

### Note: `nowlez.com` is already a live product
The domain resolves to a **live SaaS** — the "Munshi" brand, eCourts/CNR sync, WhatsApp alerts,
~₹1,000–4,000/mo — i.e., the operator's own project (this `NowlezMunshi` workspace). It is **not** a
"comparison-content publisher" (a misreading of one search snippet). This suggests the product may
already be partly shipped; **confirm what is live vs. what this repo is for** before treating the repo
as greenfield. *(Confidence: **High** that the site is a live product; the relationship to this repo is
inferred.)*

---

## Verification ledger

20 claims, 3 adversarial verifiers, **0 refutations**. Confidence reflects the post-verification view.

| # | Claim (abridged) | Verdict | Confidence |
| --- | --- | --- | --- |
| V1 | Gemma 4 released Mar 31 2026 (E2B/E4B/26B-A4B MoE/31B), Gemini-3-based | ✅ Supported ×3 | High |
| V2 | Gemma 4 licensed Apache 2.0 (break from custom Gemma Terms) | ✅ Supported ×3 | High |
| V3 | Gemma 4 12B "Unified" (encoder-free, native audio) added Jun 3 2026 | ✅ Supported ×3 | High |
| V4 | Gemma 3 vision @4B/12B/27B; 1B text-only | ✅ Supported ×3 | High |
| V5 | Gemma 3n (E2B/E4B) natively multimodal | ✅ Supported ×3 | High |
| V6 | Gemma free-tier-only on Google's API (no paid per-token SKU) | ✅ Supported ×3 | High |
| V7 | Hosted Gemma 3 ≈ $0.02–0.08/M (input/low-end; output higher) | ✅ Supported ×3 | High* |
| V8 | Gemma 3 image ≈ 256 tokens/896² crop (SigLIP) + Pan & Scan | ✅ Supported ×3 | High |
| V9 | Mistral OCR 3 ≈ $2/1,000 pages, Dec 2025 | ✅ Supported ×3 | High |
| V10 | Official eCourts APIs (NAPIX/NJDG/Kerala DigiCourt) gov/authorized-only | ✅ Supported ×3 | High |
| V11 | eCourts mobile app publishes no public developer API; fronts NJDG | ✅ Supported ×3 | High |
| V12 | Maintained OSS tools scrape the web portal + OCR CAPTCHA (not a mobile API) | ✅ Supported ×3 | High |
| V13 | *No* public mobile-API teardown / *no* attestation evidence | ⚠️ Uncertain ×3 | Low (unprovable negative) |
| V14 | Commercial "eCourts APIs" are scraper-backed resellers, not official feeds | ✅ Supported ×3 | High** |
| V15 | SC (Feb 2026) flagged AI-fabricated citations as possible misconduct | ✅ Supported ×3 | High*** |
| V16 | Case Bench: CNR + WhatsApp/email cause lists + AI drafting; ₹1,499–3,999/mo | ✅ Supported ×3 | Med–High |
| V17 | Lexshastra: CNR import + AI drafting from ₹250/mo, Android-first | ✅ Supported ×3 | Med–High |
| V18 | jhana.ai raised $1.6M seed led by Together Fund (Sept **2024**) | ✅ Supported ×3 | High |
| V19 | Provakil: ~19,000 forums, WhatsApp/email cause lists, corporate | ✅ Supported ×3 | High |
| V20 | nowlez.com is live | ✅ ×2 / ⚠️ ×1 | High site-live; characterisation corrected (it is a product, not a comparison publisher) |

\* The "$0.02–0.08/M" band holds for **input on small models**; output and 27B exceed it.
\** The "Apify ~$19/1,000" figure was **corrected to ~$4.99/1,000**.
\*** "Advocate professional misconduct" is the **BCI** extension, not a direct SC holding (see §3).

## Key sources

**Gemma / models** — `ai.google.dev/gemma/docs/releases` · `ai.google.dev/gemma/docs/core/model_card_4` ·
`blog.google/innovation-and-ai/technology/developers-tools/` · `opensource.googleblog.com` (Apache-2.0
announcement) · `huggingface.co/blog/gemma3` · `huggingface.co/blog/gemma3n` · `arxiv.org/abs/2503.19786`
(Gemma 3 technical report) · `ai.google.dev/gemini-api/docs/pricing` · `openrouter.ai` · `mistral.ai/news/mistral-ocr-3`.

**eCourts access / defenses** — `nic.gov.in/service/napix` · `doj.gov.in/the-national-judicial-data-grid-njdg` ·
`ecommitteesci.gov.in/service/ecourts-services-mobile-application/` · `ecourts.kerala.gov.in/digicourt` ·
`github.com/openjustice-in/ecourts` · `github.com/iamshouvikmitra/bharat-courts` · `ecourtsindia.com/api` ·
`surepass.io/ecourts-api` · `authbridge.com` · `developer.android.com/google/play/integrity/overview`.

**Landscape / regulation** — `casebench.in` · `lexshastra.in` · `provakil.com` · `jhana.ai` +
`entrackr.com` (funding) · `scconline.com` + `barandbench.com` + `medianama.com` (SC matter) ·
`ipleaders.in` (2026 tool census).

## Methodology note

Search angles: (1) eCourts data access & official APIs; (2) eCourts mobile attestation/anti-bot;
(3) Gemma versions/vision/licensing; (4) Gemma deployment & cost; (5) Indian legal-tech landscape.
Each ran as an independent agent that fetched primary pages and emitted falsifiable claims with
citations. The 20 most decision-critical/surprising claims were then checked by three independent
adversarial verifiers (primary-source, independent-source, skeptic). A claim required ≥2/3 refutes to
be dropped; none were. The post-cutoff claims (V1–V3, V9, V15) survived specifically because verifiers
located **first-party** confirmation, steering around the dense AI-generated SEO content around these
topics.
