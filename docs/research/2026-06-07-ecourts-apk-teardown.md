# eCourts Services APK — Static Teardown (Cordova build, codec extracted)

> **What this is.** A first-hand static teardown of the **operator-supplied** eCourts Services APK
> that fully recovered the request/response **codec** and endpoint surface, and the basis for the
> now-**real** [`EcourtsMobileSource`](../../packages/court-data/src/ecourts-mobile-source.ts) +
> [`ecourts-codec.ts`](../../packages/court-data/src/ecourts-codec.ts) ([ADR-0016](../decisions/0016-ecourts-mobile-source.md)).
> It **complements, and partly supersedes,** the [2026-06-05 teardown](2026-06-05-ecourts-apk-teardown.md),
> which analysed a **different build** (see *Relation to the 2026-06-05 report*).

**Date:** 2026-06-07
**Subject:** operator-supplied `ecourts.apk` — a **Cordova/PhoneGap WebView** build of the eCourts
Services app. **Size** 7.63 MB (7,999,529 bytes); **md5** `9371cafca94b8d0edb9703c4fa16f6ef`;
**sha256** `e3a142198ef3cdfa72ff1129666ffe5be381d3f0854f924bcf24f65bbab90ff9`.
(The 2026-06-05 report's APK was md5 `e4dc8d52…` — a different artifact.)
**Scope:** **static analysis only — the app was not executed, and NO request was made to any eCourts
server.** Purpose: recover the request-parameter codec + endpoint surface so the `CourtDataSource`
mobile adapter can speak the protocol. Authorized by the operator for interoperability over public
court-record data.
**Method:** selective unzip of `assets/`, `classes.dex`, `AndroidManifest.xml`, `META-INF`; read of
the plain-JS app logic; known-answer cross-check of the reimplemented codec against the APK's **own**
bundled CryptoJS v3.1.2 (run under Node `vm`, offline).

> **Authorization & ethics.** Interoperability research on a **publicly-distributed government app**
> over **public court-record data**, on the operator's own product, with the operator's sign-off.
> The "encryption" below is an **obfuscation / access-control gate** built from keys hard-coded in the
> shipped client (so: not a secret, and in fact well-known sample AES keys) — reproducing it to read
> an advocate's *own* caseload is interoperability, not a security break. Live use against the
> government backend remains **gated on legal/compliance sign-off** and is **off by default**
> ([open questions](../open-questions.md#ecourts-integration)). No DoS / mass-extraction: the adapter
> serves a practitioner's own cases, rate-limited.

---

## Headline

The supplied APK is a **Cordova/WebView** app: all logic ships as **plain (readable) JavaScript**
under `assets/www/` — `main.js` (District Courts) and `main_hc.js` (High Courts) hold the entire
request/response codec. No Hermes bytecode, no MITM needed. The codec is **AES-128-CBC/PKCS7 with
keys + an IV-prefix table hard-coded in the client**, reproduced in
[`ecourts-codec.ts`](../../packages/court-data/src/ecourts-codec.ts) and **proven byte-identical** to
the app's own CryptoJS by a known-answer test ([`ecourts-codec.test.ts`](../../packages/court-data/src/ecourts-codec.test.ts)).

## The codec (verified)

Identical in `main.js` and `main_hc.js`. Node's built-in `crypto` reproduces it exactly because the
app passes a **WordArray** key to CryptoJS (raw AES — no OpenSSL salt / EVP-KDF), so **no third-party
crypto dependency** is needed. Canonical source of truth: `ecourts-codec.ts`.

**Request — `encryptData(data)`** (used for the `params` payload *and* the bearer token):
1. `plain = JSON.stringify(data)`
2. AES-128-CBC/PKCS7, **request key** (hex) `4D6251655468576D5A7134743677397A` (ASCII `MbQeThWmZq4t6w9z`)
3. IV (16 bytes) = `prefix` ++ `randomLow`, where `prefix` is one of **6** hard-coded 8-byte values
   chosen at random (`generateGlobalIv`) and `randomLow` is 8 random bytes (`genRanHex(16)`):
   `556A586E32723575 · 34743777217A2543 · 413F4428472B4B62 · 48404D635166546A · 614E645267556B58 · 655368566D597133`
4. wire blob = `randomLowHex(16 chars)` ++ `prefixIndex(1 digit 0-5)` ++ `base64(ciphertext)`
5. sent as a **single query param**: `GET {base}{endpoint}.php?params=<blob>`

**Auth:** header `Authorization: Bearer <encryptData(jwtToken)>` on every call except
`appReleaseWebService.php`. The token starts empty; the decoded response body may carry `token`,
which is reused (and refreshed on a `status:"N"` / `status_code:"401"` envelope — the regeneration
loop is observed but not yet modelled server-side).

**Response — `decodeResponse(body)`:**
- **response key** (hex) `3273357638782F413F4428472B4B6250` (ASCII `2s5v8x/A?D(G+KbP`)
- IV = `Hex(body[0:32])` (full 16-byte random IV, sent in the clear); ciphertext = `base64(body[32:])`
- AES-128-CBC decrypt → UTF-8 → `JSON.parse`

> Both IV halves travel in the clear (they must, for the server to decrypt) — confirming the **key**,
> not the IV, is the only "secret," and it's shipped in every client. This is obfuscation, not
> confidentiality.

## Endpoint surface

**Bases:** `https://app.ecourts.gov.in/ecourt_mobile_DC/` (District Courts) and
`…/ecourt_mobile_HC/` (High Courts). All endpoints are `*.php`, **GET** with `?params=<blob>`.
Recovered from `hostIP + "<name>.php"` across the app JS:

- **Case data:** `caseHistoryWebService.php` *(CNR as `cinum`; response under `history`)*,
  `filingCaseHistory.php`, `listOfCasesWebService.php`, `todaysCasesWebService.php`,
  `s_show_business.php`, `s_show_app.php`, `caveatCaseHistoryWebService.php`
- **Search:** `showDataWebService.php` *(party name as `pet_name`)*, `caseNumberSearch.php`,
  `caseNumberWebService.php`, `searchByCaseType.php`, `searchByActWebService.php`, `actWebService.php`,
  `searchByAdvocateName.php`, `searchByFilingNumberWebService.php`, `pretrialNumberSearch.php`,
  `policeStationWebService.php`, `searchCaveat.php`, `caseTypeCaveat_hc.php`
- **Cause list / reference:** `causeListWebService.php`, `causeListBenchWebService.php`, `cases_new.php`,
  `courtNameWebService.php`, `stateWebService.php`, `districtWebService.php`, `courtEstWebService.php`,
  `latlong.php`, `getAllLabelsWebService.php`
- **App:** `appReleaseWebService.php` *(no auth header)*

Every authenticated request also carries `language_flag` (e.g. `"english"`) and `bilingual_flag`
(`"0"`/`"1"`).

## Live validation (2026-06-07)

An operator ran the capture tool against the production backend on their own case — confirming the
codec end-to-end beyond the offline KAT:

- **Codec works against prod:** the request was accepted and the encrypted response **decrypted to
  clean JSON** (a wrong key would yield garbage).
- **Token bootstrap confirmed:** the first (empty-token) call returns `{status, Msg, status_code:401}`;
  retrying once with `uid` (`deviceId:packageName`) added to the params mints the `token` and returns
  the case. Implemented as `ecourtsRequest` (`ecourts-protocol.ts`).
- **Case-history `history` schema confirmed** (real field names now in the mapper): `cino`,
  `type_name`, `reg_no`/`reg_year`, `case_no`, `date_of_filing`, `dt_regis`, `date_next_list`,
  `date_of_decision` (null ⇒ pending), `pet_name`/`res_name` (+ `petparty_name`/`resparty_name`),
  `state_name`/`district_name`/`court_name`, `est_code`, `act`, `historyOfCaseHearing`, and
  `interimOrder`/`finalOrder` — which the app code shows are **server-rendered HTML tables** (appended
  straight to the DOM), not JSON arrays (both **null** for that case). Order/business PDFs are a
  separate `s_show_business.php` flow (also HTML). So structured order extraction means HTML parsing,
  pending a real with-orders sample.

## What is verified vs. still provisional

| Verified (KAT + live capture) | Still provisional (needs a further capture) |
| --- | --- |
| Keys, IV table, AES-128-CBC/PKCS7, request **and** response wire formats | **Order HTML parsing** (`interimOrder`/`finalOrder` are HTML tables — needs a with-orders sample to parse rows + PDF links) |
| `GET …?params=<blob>` + `Authorization: Bearer <encrypt(token)>` + **401→uid bootstrap** | Search / cause-list **response** field names (a search/cause-list capture) |
| Endpoint `*.php` filenames; DC/HC base paths | Exact request param sets for case-number search & cause-list (filenames confirmed) |
| `getCaseByCnr` request (`cinum`) + full **`history`** response schema; party search request (`pet_name`) | QR payload format (the adapter assumes the QR encodes the CNR and reuses the verified case-history path) |

The adapter keeps the provisional pieces behind lenient mappers, so each further capture is a small,
local change — not a rewrite.

## Relation to the 2026-06-05 report

The [2026-06-05 teardown](2026-06-05-ecourts-apk-teardown.md) analysed a **different build** — a
**React-Native/Hermes** APK (md5 `e4dc8d52…`) with bases `services_DC_4.0/` / `services_HC_4.0/` and
an axios `encryptParams` interceptor. This APK is **Cordova/WebView** (md5 `9371cafc…`) with bases
`ecourt_mobile_DC/` / `ecourt_mobile_HC/` and the plain-JS `encryptData`/`decodeResponse` above.
Reconciliation:

- **Consistent:** the `*.php` service **names** (`caseHistoryWebService.php`, `causeListWebService.php`,
  …), the CAPTCHA-free / attestation-free posture, and the *shape* of the gate (client-side AES with
  hard-coded key + generated IV).
- **Differs:** app framework (Hermes vs Cordova), **base path**, and the concrete crypto
  implementation. Our keys pair with the **`ecourt_mobile_*` base** (this build); the Hermes build's
  `services_*` base would carry its own key material.
- **Net:** for NowLez's implementation, **this report is authoritative** (codec directly extracted +
  verified); the 2026-06-05 report stands as the security-posture analysis that validated ADR-0004.

## Reproduction (high level)

1. Verify the APK hash (above). Treat as a ZIP; selectively extract `assets/`, `classes.dex`,
   `AndroidManifest.xml`, `META-INF` (a case-colliding `res/aA.xml` defeats naive recursive unzip on
   case-insensitive filesystems).
2. Read `assets/www/js/main.js` / `main_hc.js`: `encryptData`, `decodeResponse`, `generateGlobalIv`,
   `genRanHex`, `callToWebService`, and the `hostIP + "*.php"` endpoints.
3. Reimplement with Node `crypto` and **prove it** offline: load the APK's own
   `assets/www/js/vendor/cryptojs/rollups/aes.js` + `components/enc-base64.js` under Node `vm`, mint a
   known-answer vector, and assert the reimplementation matches byte-for-byte (see
   `ecourts-codec.test.ts`). No live call required.

## Caveats / limits

- **Static only**; no request was made to eCourts. Response **field names**, the token handshake, and
  server-side rate-limiting/blocking are **not** observed — confirm with an authorized capture on your
  own account before relying on the mapped DTO fields.
- Point-in-time for this build; the bundle (and the hard-coded crypto) can change between releases —
  treat the keys/IV table as **per-release** and re-verify on updates.
- **Legal status unresolved** (§43 IT Act 2000, DPDP, eCourts ToS) — a compliance review gates any
  productionisation. See [open questions](../open-questions.md#ecourts-integration) and the
  [go-live runbook](../runbooks/ecourts-mitm-and-codec.md).

## Related

- [ADR-0016](../decisions/0016-ecourts-mobile-source.md) · [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md)
- [Go-live runbook](../runbooks/ecourts-mitm-and-codec.md) · [2026-06-05 teardown](2026-06-05-ecourts-apk-teardown.md)
- [`ecourts-codec.ts`](../../packages/court-data/src/ecourts-codec.ts) ·
  [`ecourts-mobile-source.ts`](../../packages/court-data/src/ecourts-mobile-source.ts) ·
  [open questions](../open-questions.md#ecourts-integration)
