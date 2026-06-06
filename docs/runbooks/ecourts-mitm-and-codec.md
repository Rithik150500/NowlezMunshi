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

> **cause-list note:** the adapter currently maps to `causeListWebService.php` — in the app that is
> the *advocate's* cause list, while the *court's* daily list is `cases_new.php`. If the `cause-list`
> capture returns an error/empty, that's the signal to switch the endpoint to `cases_new.php` (and its
> params); send me the result and I'll adjust the builder + mapper.

### 2b. Alternative: observe the official app via a proxy

If you'd rather see the real app's traffic, on **your own authorized account**:

1. Run an intercepting proxy (mitmproxy / Charles / Burp); route your device/emulator through it and
   install its CA. If the app pins TLS, use a debuggable build / pinning bypass **on your own device**.
2. Exercise each operation once and record the **decoded** response JSON (decrypt the body with the
   response key, or read it post-decryption). Scrub personal data.

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
