# Runbook — eCourts mobile-app: go-live

How to bring the [`EcourtsMobileSource`](../../packages/court-data/src/ecourts-mobile-source.ts)
([ADR-0016](../decisions/0016-ecourts-mobile-source.md)) online safely. The **request/response codec
is already implemented and verified** ([`ecourts-codec.ts`](../../packages/court-data/src/ecourts-codec.ts),
from the [2026-06-07 teardown](../research/2026-06-07-ecourts-apk-teardown.md)) — so the remaining
work is **legal sign-off**, an optional **response-shape confirmation**, and **enabling the source**.
It is **off by default** and must never be auto-enabled.

## 0. Prerequisites (do not skip)

- **Legal / compliance sign-off first.** Automated extraction touches §43 IT Act 2000, the DPDP
  Act, and the eCourts Terms of Service ([open questions](../open-questions.md#ecourts-integration)).
  This is a **blocking prerequisite**, independent of the (now low) technical barrier. Get it in
  writing. The codec being implemented does **not** change this gate.
- **Authorized testing only**, on **your own device and a test account/handset**, against your own
  traffic — never another user's. Keep captures off production and out of version control.
- Confirm whether **authorized official access** (NAPIX / NJDG / a High Court API cell) is
  attainable — it may make this whole path unnecessary and is the cleaner long-term answer.

## 1. What is already done (codec extracted + verified)

From the [2026-06-07 static teardown](../research/2026-06-07-ecourts-apk-teardown.md) of the
Cordova build, fully reproduced in `ecourts-codec.ts` and **proven byte-identical** to the app's own
CryptoJS by a known-answer test (no live call):

- **Request:** `GET {base}{endpoint}.php?params=<blob>`, where `<blob>` is
  `AES-128-CBC/PKCS7(JSON.stringify(params))` formatted as `randomIvHex(16) + prefixIndex(1) + base64(ct)`.
- **Auth:** `Authorization: Bearer <encrypt(jwtToken)>` (empty token on the first call). The backend
  replies `status_code: 401`; the client retries ONCE with a `uid` (`deviceId:packageName`) added to
  the params, which mints the session `token` (reused thereafter). **This bootstrap is implemented**
  (`ecourtsRequest` in `ecourts-protocol.ts`); set `NOWLEZ_ECOURTS_DEVICE_ID` for a stable device id.
- **Response:** body `ivHex(32) + base64(ct)`, AES-128-CBC decrypted → JSON.
- **Bases:** `https://app.ecourts.gov.in/ecourt_mobile_DC/` (DC) · `…/ecourt_mobile_HC/` (HC).
- **Verified endpoints/params:** case history (`caseHistoryWebService.php`, CNR as `cinum`, result
  under `history`); party search (`showDataWebService.php`, name as `pet_name`). Other endpoint
  filenames are confirmed; their request params/response fields are provisional (below).

The keys + IV table are hard-coded **per app release** — treat them as rotatable and re-verify on
updates (re-run the teardown's KAT step).

## 2. (Optional) Confirm response shapes with an authorized capture

The codec needs no capture. A capture is only useful to **confirm the response field names** (the
inner shape of `history` / search / cause-list rows) and the **token bootstrap / 401** path, which
remain provisional.

### 2a. Easiest: the built-in capture tool (no proxy needed)

Because the codec is reimplemented, you don't need a proxy or a pinning bypass — just run one request
through our own client. **On your own machine, with legal sign-off, against your own case:**

One mode per operation (`--state/--dist/--court` are eCourts numeric codes):

```sh
# case history (verified) — bare CNR
NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture <YOUR_CNR>
# party search
NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture party       --state <S> [--dist <D>] [--court <C>] --name "<NAME>" --year <Y> [--status Pending|Disposed]
# case-number search
NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture case-number --state <S> [--dist <D>] [--court <C>] --type <T> --no <N> --year <Y>
# cause list (provisional endpoint — see note)
NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture cause-list  --state <S> [--dist <D>] [--court <C>] --date <YYYY-MM-DD>

# flags: --hc (High Court base) · --raw (full decoded JSON — your eyes only)
```

It refuses to run without `NOWLEZ_ECOURTS_LIVE_OK=1` (a deliberate affirmation that live sign-off is
in place). Default output is the redacted shape — **safe to paste back** so the field names can be
locked into the mappers. `--raw` contains personal data; never share it. Source:
[`ecourts-capture.ts`](../../packages/court-data/src/ecourts-capture.ts) +
[`scripts/ecourts-capture.ts`](../../packages/court-data/scripts/ecourts-capture.ts).

> **cause-list — confirmed multi-step + HTML (2026-06-07 RE):** the court-daily list is NOT
> `causeListWebService.php` (that's the *advocate* list, which our `cause-list` mode hits and which
> returns a non-standard body). The court-daily list is `cases_new.php`, reached via a two-step flow
> (`cause_list.js`): **(1)** `courtNameWebService.php` `{state_code, dist_code, court_code:
> <njdg_est_code(s)>, language_flag, bilingual_flag}` → `{courtNames:[…]}` to pick a court (yields
> `court_no` + `court_code`); **(2)** `cases_new.php` `{state_code, dist_code, court_no, court_code,
> causelist_date (**DD-MM-YYYY**), flag (Civil/Criminal), selprevdays, language_flag, bilingual_flag}`.
> The response is **server-rendered HTML** under `cases` (appended to the DOM) — so cause-list needs an
> HTML parser, not a JSON mapper, and a `court-names` + `cases_new` capture pair to fetch it. Same HTML
> shape as orders. Pattern: detail/reference endpoints (case-history, complexes) return JSON and work
> cold; list/document endpoints (search, cause-list, orders) return HTML and/or need a live session.

#### Live-capture status (2026-06-07)

Authorized live runs against production confirmed:

- **Codec + 401 `uid` bootstrap work end-to-end** (requests accepted; encrypted responses decrypt to
  clean JSON; the empty-token call 401s, the one-shot `uid` retry mints the token).
- **Case history** (`caseHistoryWebService.php`) — full `history` schema mapped + live-validated.
- **Complex discovery** (`courtEstWebService.php` / `fillCourtComplex`) — returns `{courtComplex:[…]}`;
  each complex's `njdg_est_code` is the search's `court_code_arr` (a case's `court_code`/`est_code` is
  **not** it). Mapped via `mapCourtComplexes` (the `complexes` capture mode prints the clean list).

**Still open — search results need a real-app capture.** party + case-number search return
`{token, no_of_establishments}` with **no establishment entries**, even with the **correct**
establishment (njdg_est_code matched to the case's own court) **and** a **guaranteed-match** term (the
case's own petitioner name / registration number). Ruled out by capture + static RE: request params
(they match the app's `displayCasesTable`), establishment code, case-type, the auth token, and general
session-warmth (**case-history and complexes both succeed on cold stateless calls — only search returns
a count-only envelope**). The remaining unknown is a **search-endpoint-specific server behaviour** not
expressed in the minified JS. To finish the `RawSearchHit` mapper: capture **one _successful_ search
from the real app** (§2b) and diff its request against ours (`partySearchRequest` /
`caseNumberSearchRequest` in `ecourts-requests.ts`) — the delta (an extra param/header, or a second
call keyed to `no_of_establishments`) is the missing piece. The successful response is keyed by
establishment: `{ <est>: { court_code, establishment_name, caseNos:[{cino, case_no, case_no2,
type_name, reg_year, petnameadArr, filing_no}] } }` (from `caseStatusSearchResult` in `main.js`).

### 2b. Observe the official app via a proxy (the only way to crack search results)

Search results, cause-list HTML, and the order tables all need to be seen from the **real app** — the
adapter's stateless request is correct-looking but the backend returns metadata-only (search) or HTML
(cause-list/orders). On **your own device + authorized account**:

1. **Proxy:** run mitmproxy (`mitmweb`) on your machine; point the phone's Wi‑Fi proxy at it and
   install the mitmproxy CA on the phone (`http://mitm.it`).
2. **TLS pinning:** the app pins certs, so on a rooted device / emulator use a bypass
   (e.g. Frida `frida-multiple-unpinning`, or objection `android sslpinning disable`) for **your own
   traffic only**.
3. **Drive the app:** sign in, then perform a **search that returns results** (e.g. case-number in a
   court you have a case in). In mitmproxy, find the `GET …/ecourt_mobile_DC/caseNumberSearch.php?params=…`
   request and save **both** the `params=` value and the response body.
4. **Decode it (offline, no re-capture needed):** paste the captured ciphertext into the decoder —
   it applies our verified codec so you read plaintext:

   ```sh
   pnpm ecourts:decode request  '<the params= value>'    # → the exact request params the app sent
   pnpm ecourts:decode response '<the raw response body>' # → the decrypted JSON results
   ```

5. **Diff & finish:** compare the decoded **request** against what our adapter sends
   (`partySearchRequest` / `caseNumberSearchRequest` in `ecourts-requests.ts`). The delta — an extra
   param, a header, or a second call keyed to `no_of_establishments` — is the missing piece; send me
   the decoded request + the (PII-scrubbed) response shape and I'll finish the mapper.

The same `pnpm ecourts:decode response '…'` turns a captured **cause-list** (`cases_new.php`) or
**order** body into readable HTML to build those parsers against. For just confirming **response field
names** (no proxy), the §2a capture tool is simpler:

   | Operation | Adapter method | Endpoint (verified) | Field shapes |
   | --- | --- | --- | --- |
   | Case by CNR | `getCaseByCnr` | `caseHistoryWebService.php` (`cinum`) | `history` envelope ✓; inner fields provisional |
   | Case by QR | `getCaseByQr` | → case-history (CNR from QR) | QR payload format assumed |
   | Search by party | `searchByParty` | `showDataWebService.php` (`pet_name`) | row fields provisional |
   | Search by case number | `searchByCaseNumber` | `caseNumberSearch.php` | params + row fields provisional |
   | Cause list | `getCauseList` | `causeListWebService.php` | params + row fields provisional |

## 3. (If captured) Lock the shapes into the mapper

Update the **lenient mappers** in `ecourts-mobile-source.ts` to the captured field names:
- the `Raw*` response interfaces + the `map*` functions to the captured JSON field names;
- any request param refinements (e.g. case-number search keys) to what was on the wire.

Add a test that maps a **real captured response fixture** (personal data scrubbed) to the contract
DTOs. The existing tests already cover the mechanics against provisional shapes; this swaps in the
confirmed ones. Keep everything TDD'd.

## 4. Enable it

- Set `NOWLEZ_COURT_SOURCE=ecourts-mobile`. Optionally set `NOWLEZ_ECOURTS_BASE_URL` to the HC base
  (`…/ecourt_mobile_HC/`) for High Court use; the DC base is the default.
- `GET /config` will report the source as `ecourts-mobile`. Do a single **guarded live smoke test**
  (your own case, with sign-off in hand) before enabling tracking.

## 5. Operational guardrails (already at the seam)

- **Rate-limit** every upstream call: `NOWLEZ_COURT_MIN_INTERVAL_MS` (the
  [`RateLimitedCourtDataSource`](../../packages/court-data/src/caching-source.ts)).
- **Cache / fetch-once-fan-out**: `NOWLEZ_COURT_CACHE_TTL_MS` (the `CachingCourtDataSource`) — keep
  the TTL **well below** the daily-refresh interval so it never masks a day's changes.
- Re-verify the codec across app releases (key rotation), and re-confirm shapes if responses change.
- The adapter serves a practitioner's **own** caseload — never use it for bulk/mass extraction.

## Related

- [ADR-0016](../decisions/0016-ecourts-mobile-source.md) · [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md)
  · [ecourts-integration.md](../ecourts-integration.md)
- [2026-06-07 teardown (codec)](../research/2026-06-07-ecourts-apk-teardown.md) ·
  [2026-06-05 teardown (posture)](../research/2026-06-05-ecourts-apk-teardown.md) ·
  [open questions](../open-questions.md#ecourts-integration)
