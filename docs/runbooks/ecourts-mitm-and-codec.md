# Runbook — eCourts mobile-app: capture, codec, and go-live

How to turn the **provisional** [`EcourtsMobileSource`](../../packages/court-data/src/ecourts-mobile-source.ts)
([ADR-0016](../decisions/0016-ecourts-mobile-source.md)) into a working source: capture the real
traffic, derive the request-parameter codec, confirm the wire shapes, and bring it online safely.
The adapter is built so this work touches **two seams only** — the `EcourtsParamCodec` and the
provisional request paths / `Raw*` shapes — not the rest of the codebase.

## 0. Prerequisites (do not skip)

- **Legal / compliance sign-off first.** Automated extraction touches §43 IT Act 2000, the DPDP
  Act, and the eCourts Terms of Service ([open questions](../open-questions.md#ecourts-integration)).
  This is a **blocking prerequisite**, independent of the low technical barrier. Get it in writing.
- **Authorized testing only**, on **your own device and a test account/handset**, against your own
  traffic — never another user's. Keep captures off production and out of version control.
- Confirm whether **authorized official access** (NAPIX / NJDG / a High Court API cell) is
  attainable — it may make this whole path unnecessary and is the cleaner long-term answer.

## 1. What we already know (APK teardown)

From the [2026-06-05 static teardown](../research/2026-06-05-ecourts-apk-teardown.md) of v4.0.1:
the backend (`app.ecourts.gov.in`, the `services_*` endpoints) is **CAPTCHA-free** and
**attestation-free**; the one barrier is **client-side request-parameter encryption**, applied
per release. So the plan is: capture → reproduce that encryption as the codec.

## 2. Capture the live traffic (MITM)

1. Run an intercepting proxy (mitmproxy / Charles / Burp) and route an Android device or emulator
   through it; install the proxy's CA so TLS can be read.
2. Install the eCourts Services app; if it pins certificates, use a debuggable build / a pinning
   bypass **on your own device** to observe your own requests.
3. Exercise each operation once and record the **exact** request (path, method, headers, the
   encrypted parameter blob) and the **response body**:

   | Operation | Adapter method | Provisional path (replace) |
   | --- | --- | --- |
   | Case by CNR | `getCaseByCnr` | `services/case/cnr` |
   | Case by QR | `getCaseByQr` | `services/case/qr` |
   | Search by party | `searchByParty` | `services/search/party` |
   | Search by case number | `searchByCaseNumber` | `services/search/case-number` |
   | Cause list | `getCauseList` | `services/cause-list` |

## 3. Derive the parameter codec

1. In the APK (jadx / Ghidra for any native lib), locate the routine that builds the request body
   — the param-encryption function. Identify the **algorithm, key, IV/nonce, and encoding**, and
   whether the key is **embedded per release** (so it rotates on app updates).
2. Reimplement it as an `EcourtsParamCodec` (`encode(params) -> Record<string,string>`) in a new
   module, e.g. `packages/court-data/src/ecourts-real-codec.ts`. Keep the key out of the repo
   (env / secret store); document the per-release rotation.
3. **Validate the codec offline**: feed it the plaintext params from a captured request and assert
   the output **byte-for-byte equals** the captured encrypted blob. That test is the proof the
   codec is correct — no live calls needed.

## 4. Confirm the wire shapes

Update the two isolated seams in `ecourts-mobile-source.ts` to the captured reality:
- the **request paths** (the `DEFAULT_*_PATH` constants) and **param names** (`cino`, `party_name`,
  …) to what was on the wire;
- the `Raw*` response interfaces + the `map*` functions to the captured JSON field names.

Add a test that maps a **real captured response fixture** to the contract DTOs (scrub any personal
data first). The existing tests already cover the mapping mechanics against provisional shapes;
this swaps in the confirmed ones.

## 5. Wire it in

- Inject the real codec where the source is constructed (extend `EcourtsMobileConfig` / add a codec
  registry keyed by app release), and set `NOWLEZ_COURT_SOURCE=ecourts-mobile` +
  `NOWLEZ_ECOURTS_BASE_URL`.
- `GET /config` will report the source as live (= *wired*). Do a single **guarded live smoke test**
  (your own case) before enabling tracking.

## 6. Operational guardrails (already at the seam)

- **Rate-limit** every upstream call: `NOWLEZ_COURT_MIN_INTERVAL_MS` (the
  [`RateLimitedCourtDataSource`](../../packages/court-data/src/caching-source.ts)).
- **Cache / fetch-once-fan-out**: `NOWLEZ_COURT_CACHE_TTL_MS` (the `CachingCourtDataSource`) — keep
  the TTL **well below** the daily-refresh interval so it never masks a day's changes.
- Maintain the codec across app releases (key rotation), and re-confirm shapes if responses change.

## Related

- [ADR-0016](../decisions/0016-ecourts-mobile-source.md) · [ADR-0004](../decisions/0004-extract-from-ecourts-mobile-app.md)
  · [ecourts-integration.md](../ecourts-integration.md)
- [APK teardown](../research/2026-06-05-ecourts-apk-teardown.md) ·
  [open questions](../open-questions.md#ecourts-integration)
