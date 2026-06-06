/**
 * Operator-run CLI for a SINGLE, authorized live eCourts capture. Run from the repo root:
 *
 *   NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture <CNR> [--raw] [--hc]
 *
 * It performs one real request to the eCourts mobile backend through the verified codec and prints
 * the PII-safe response SHAPE (keys + value types) by default — use that to lock the response field
 * names into the adapter's mappers. `--raw` prints the full decoded JSON (your eyes only: it contains
 * personal data — never paste raw output into issues/PRs). `--hc` targets the High Court base.
 *
 * ⚠️ LIVE traffic to a government judicial backend. Only run with legal/compliance sign-off for live
 * use, against your OWN account/case. The run refuses unless NOWLEZ_ECOURTS_LIVE_OK=1 affirms this.
 * See docs/runbooks/ecourts-mitm-and-codec.md.
 */
import {
  assertLiveCaptureAllowed,
  captureCaseHistory,
  redactToShape,
} from "../src/ecourts-capture";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cnr = args.find((arg) => !arg.startsWith("--"));
  if (!cnr) {
    console.error("usage: NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture <CNR> [--raw] [--hc]");
    process.exitCode = 2;
    return;
  }

  // Gate the live call BEFORE touching the network.
  assertLiveCaptureAllowed();

  const config = args.includes("--hc")
    ? { baseUrl: "https://app.ecourts.gov.in/ecourt_mobile_HC/" }
    : {};
  const decoded = await captureCaseHistory(cnr, config);
  const output = args.includes("--raw") ? decoded : redactToShape(decoded);
  console.log(JSON.stringify(output, null, 2));
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
