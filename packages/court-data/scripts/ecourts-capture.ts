/**
 * Operator-run CLI for a SINGLE, authorized live eCourts capture. Run from the repo root:
 *
 *   NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture <CNR> [--hc] [--raw]
 *   NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture party       --state <S> [--dist <D>] [--court <C>] --name <NAME> --year <Y> [--status Pending|Disposed] [--hc] [--raw]
 *   NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture case-number --state <S> [--dist <D>] [--court <C>] --type <T> --no <N> --year <Y> [--hc] [--raw]
 *   NOWLEZ_ECOURTS_LIVE_OK=1 pnpm ecourts:capture cause-list  --state <S> [--dist <D>] [--court <C>] --date <YYYY-MM-DD> [--hc] [--raw]
 *
 * Each runs ONE real request through the verified codec and prints the PII-safe response SHAPE
 * (keys + value types) by default — paste that back to lock the response field names into the
 * mappers. `--raw` prints the full decoded JSON (your eyes only: personal data — never share).
 * `--hc` targets the High Court base. `--state/--dist/--court` are eCourts numeric codes.
 *
 * ⚠️ LIVE traffic to a government judicial backend. Only run with legal/compliance sign-off for live
 * use, against your OWN account/case. Refuses unless NOWLEZ_ECOURTS_LIVE_OK=1 affirms this. See
 * docs/runbooks/ecourts-mitm-and-codec.md.
 */
import {
  assertLiveCaptureAllowed,
  parseCaptureArgs,
  redactToShape,
  runCapture,
} from "../src/ecourts-capture";

const USAGE = `usage (LIVE — set NOWLEZ_ECOURTS_LIVE_OK=1 with legal sign-off, your own case):
  pnpm ecourts:capture <CNR> [--hc] [--raw]
  pnpm ecourts:capture party       --state <S> [--dist <D>] [--court <EST[,EST...]>] --name <NAME> --year <Y> [--status Pending|Disposed] [--hc] [--raw]
  pnpm ecourts:capture case-number --state <S> [--dist <D>] [--court <EST[,EST...]>] --type <T> --no <N> --year <Y> [--hc] [--raw]
  pnpm ecourts:capture cause-list  --state <S> [--dist <D>] [--court <C>] --date <YYYY-MM-DD> [--hc] [--raw]
For searches, --court is the ESTABLISHMENT code(s) (a case's est_code), comma-separated for several.
Default output is a PII-safe shape (keys+types); --raw prints full decoded JSON (your eyes only).`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  const { command, hc, raw } = parseCaptureArgs(argv);
  // Gate the live call BEFORE touching the network.
  assertLiveCaptureAllowed();

  const config = hc ? { baseUrl: "https://app.ecourts.gov.in/ecourt_mobile_HC/" } : {};
  const decoded = await runCapture(command, config);
  console.log(JSON.stringify(raw ? decoded : redactToShape(decoded), null, 2));
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
