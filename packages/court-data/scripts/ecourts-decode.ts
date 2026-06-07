/**
 * Offline decoder for CAPTURED eCourts traffic (from a MITM proxy or a `--raw` dump). No network and
 * no live gate — it just applies the verified codec to pasted ciphertext, turning an encrypted request
 * blob or response body into readable JSON. Use it to diff a real *successful* request (e.g. a working
 * search) against what our adapter sends, so the missing flow detail becomes obvious.
 *
 *   pnpm ecourts:decode request  '<the params= value from a captured GET …?params=…>'
 *   pnpm ecourts:decode response '<the raw encrypted response body>'
 */
import { createEcourtsCodec, decryptRequestBlob } from "../src/ecourts-codec";

const [mode, payload] = process.argv.slice(2);

if ((mode !== "request" && mode !== "response") || !payload) {
  console.error("usage: pnpm ecourts:decode <request|response> '<captured ciphertext>'");
  process.exitCode = 2;
} else {
  try {
    const plaintext =
      mode === "request"
        ? decryptRequestBlob(payload)
        : createEcourtsCodec().decryptResponse(payload);
    // Pretty-print when it's JSON; otherwise show the raw plaintext.
    try {
      console.log(JSON.stringify(JSON.parse(plaintext), null, 2));
    } catch {
      console.log(plaintext);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
