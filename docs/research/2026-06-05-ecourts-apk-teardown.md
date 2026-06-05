# eCourts Services APK — Static Teardown

**Date:** 2026-06-05
**Subject:** `in.gov.ecourts.eCourtsServices` **v4.0.1** (vercode 10018, built 2026-05-31),
publisher "NIC eGov Mobile Apps"; APK md5 `e4dc8d52b3a3219d10e47b3998189bfd` (Aptoide mirror).
**Scope:** **Static analysis only — the app was not executed.** Purpose: validate or kill the
premise of [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md) (that the mobile app's
API is a non-CAPTCHA path) and characterise the API surface and security posture for the
`CourtDataSource` decision.
**Tools:** apktool 3.0.2, jadx 1.5.5, `hermes-dec` (Hermes HBC **v96** disassembly), `strings`,
`keytool`.

> **Authorization & ethics.** This is interoperability research on a **publicly-distributed
> government app** over **public court-record data**, for an architecture decision on the operator's
> own product. The report characterises the **security architecture and feasibility**; it
> deliberately does **not** publish key material, exact request formats, or a working bypass. The
> **legal/ToS dimension is unresolved** (§43 IT Act 2000, DPDP, eCourts ToS) and gates any
> productionisation — see *Caveats*. Findings are point-in-time for v4.0.1; the bundle changes often.

---

## Headline

The eCourts Services app (v4.0.x) is a **React Native (Hermes) app** that calls a **distinct mobile
backend** — `https://app.ecourts.gov.in/services_DC_4.0/…php` and `…/services_HC_4.0/…` — **separate
from** the CAPTCHA-guarded public web portal (`services.ecourts.gov.in/ecourtindia_v6`). That backend
is **not CAPTCHA-guarded and uses no device-integrity attestation**. The app instead guards its calls
with **client-side request-parameter encryption** (crypto-js AES, hardcoded key + generated IV), plus
**RootBeer root/emulator detection** and **TLS certificate pinning** — all *app-side* controls.

➡️ **ADR-0004's premise is substantially validated**, with one important nuance: the effective
barrier is a **client-side crypto scheme an integration must replicate** (and which can rotate per
app release), **not** a CAPTCHA and **not** device attestation.

## Findings

### 1. A distinct mobile API backend (not the web portal)
- **Host:** `app.ecourts.gov.in` (certificate-pinned). **Bases:** `/services_DC_4.0/` (District
  Courts) and `/services_HC_4.0/` (High Courts; endpoints carry `_hc` suffixes).
- **Endpoint surface** (recovered from the Hermes string table) maps almost 1:1 to NowLez's needs:
  - *Search:* `searchByPartyName.php`, `caseNumberSearch.php`, `searchByCaseType.php`,
    `searchByAdvocateName.php`, `searchByActWebService.php`, `searchByFilingNumberWebService.php`,
    `firNumberSearch.php`, `pretrialNumberSearch.php`, `searchCaveat.php`
  - *Case data:* `caseHistoryWebService.php`, `identified_cases_new.php`,
    `caveatCaseHistoryWebService.php`
  - *Cause list:* `causeListWebService.php`, `causeListBenchWebService.php`, `todaysCasesWebService.php`
  - *Reference data:* `stateWebService`, `districtWebService.php`, `courtEstWebService.php`,
    `caseTypesWebService.php`, `policeStationWebService.php`, `getAllLabelsWebService.php`
  - *PDFs:* `display_pdf_new.php`, `preTrialOrder_pdf.php`
  - *App:* `appReleaseWebService.php`, `index.php`
  - Also five non-descriptive `lc*.php` endpoints (e.g. `lcbixvwm.php`) — possibly lightly obscured.
- **Other hosts referenced:** `njdg.ecourts.gov.in`, `filing.ecourts.gov.in`, `services.ecourts.gov.in`.

### 2. No CAPTCHA on the mobile path
Zero `captcha` / `recaptcha` / `sitekey` strings or endpoints anywhere in the bundle. A CAPTCHA flow
would leave clear artifacts (an image endpoint, a `captcha` parameter, a sitekey); none exist.
**Confidence: High** (static). A dynamic capture would make it airtight.

### 3. No device-integrity attestation
No Play Integrity (`com.google.android.play.core.integrity`) or SafetyNet
(`com.google.android.gms.safetynet`) classes in the dex, **no** manifest meta-data, **no** native
attestation library, **no** GMS integrity component. The only "integrity"-style control is
**RootBeer** root/emulator detection (`libtoolChecker.so` → `RootBeerNative_checkForRoot`) — a
**client-side** check that gates the *app UI* on the device and is **invisible to a headless
server-to-server client** (RootBeer never runs). **Confidence: High.**

### 4. Transport: TLS pinning (app-side only)
`network_security_config.xml` pins two SHA-256 certificates for `app.ecourts.gov.in` (expiry
2026-12-31) and disables cleartext for that host (cleartext permitted for others). Pinning protects
the **app** from MITM; it does **not** constrain a server-side client making its own TLS connection.
It does confirm the canonical API host.

### 5. Auth / obfuscation: client-side request-parameter encryption
The app constructs its axios client with `baseURL …/services_DC_4.0/` and wires **request
interceptors / `transformRequest`** that **encrypt request parameters** (a function literally named
`encryptParams`) using **crypto-js AES** with **hardcoded key(s) + a per-request generated IV**
(`genRanHex`, `generateGlobalIv`, `createEncryptor`). Several hardcoded 16- and 32-hex-character
key/IV constants are embedded in the bundle.

- Because the key material lives **in the client**, the scheme is **extractable and replicable** by
  an automated client — but it is **brittle** (the app can rotate the key/format every release) and
  is an **access-control / obfuscation measure**, which raises the legal stakes of replicating it.
- The abundant `Hmac*` strings are largely **library boilerplate** (crypto-js + Facebook **Conceal**,
  the latter used for local data encryption); generic `Authorization`/`Bearer` strings are consistent
  with axios defaults. No evidence of a server-issued OAuth token gating these calls was found
  statically.
- **This report does not publish the key material, the exact encrypted-request format, or a working
  signing/encryption recipe.**

## Verdict for ADR-0004 / `CourtDataSource`

- The mobile backend is **real, distinct, CAPTCHA-free, and attestation-free** → the spec premise
  holds (it was previously *unverified* by public evidence; this teardown is that evidence).
- The effective barrier is **client-side request encryption** (replaceable per release) **+
  legal/ToS exposure** — not a CAPTCHA and not device attestation.
- **Trade-off vs. the web-portal scrape:**

  | | Mobile API (`app.ecourts.gov.in/services_*`) | Web portal (`ecourtindia_v6`) |
  | --- | --- | --- |
  | Endpoint surface | Cleaner, REST-ish PHP services | Form/session scraping |
  | Gate to defeat | Replicate per-release param encryption | OCR the image CAPTCHA (~75%/retry) |
  | Maintenance | Crypto rotates each app release | CAPTCHA/token scheme changes |
  | Legal sensitivity | Higher (circumvents an access-control measure) | Lower (public page + CAPTCHA) |
  | Public tooling exists | No | Yes (`openjustice-in/ecourts`, `bharat-courts`) |

- **Recommendation:** keep both implementations behind the
  [`CourtDataSource` interface](../decisions/0002-source-agnostic-court-data-interface.md). Start with
  the **web-portal scrape as the safe default**; pursue the **mobile API only with legal sign-off**,
  and confirm the exact request format with a **dynamic MITM capture** (needs a RootBeer/pinning
  bypass on an instrumented device) before building it.

## Caveats / limits

- **Static only** — exact request/response bodies, any token handshakes, and server-side
  rate-limiting/blocking were **not** observed. The CAPTCHA-absence and attestation-absence findings
  are strong but should be confirmed dynamically.
- APK came from an **Aptoide mirror**; md5 is recorded, but the signing certificate was **not**
  independently re-verified against Google Play (publisher per mirror = "NIC eGov Mobile Apps").
- Findings are **point-in-time for v4.0.1** (2026-05-31); the React Native bundle changes frequently,
  and the hardcoded crypto can rotate.
- **Legal status unresolved** (§43 IT Act 2000, DPDP, eCourts ToS) — a compliance review gates any
  productionisation. See [open questions](../open-questions.md#ecourts-integration).

## Reproduction (high level)

1. Obtain the APK for `in.gov.ecourts.eCourtsServices`; verify md5 and signer.
2. `apktool d -s` → `AndroidManifest.xml`, `res/xml/network_security_config.xml`, `assets/`.
3. `strings`/`jadx` on `classes*.dex` → confirm no Play Integrity / SafetyNet classes.
4. `hermes-dec` on `assets/index.android.bundle` (HBC v96) → endpoint surface + crypto/interceptor
   functions (`encryptParams`, `genRanHex`, `generateGlobalIv`, axios `interceptors`).

## Relation to prior research

This supersedes the "premise unsubstantiated by public evidence" conclusion in the
[2026-06-05 landscape report](2026-06-05-ecourts-gemma-landscape.md#1-ecourts-data-access--the-feasibility-crux):
that report was accurate about the *public* state of knowledge (no teardown existed); this teardown
provides the first-hand evidence and **validates the premise** (with the param-encryption nuance).
