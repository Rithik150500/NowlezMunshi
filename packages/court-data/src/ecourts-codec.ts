/**
 * The eCourts Services mobile-app request/response codec (ADR-0016).
 *
 * VERIFIED by the 2026-06-07 static teardown of the official eCourts Services APK
 * (docs/research/2026-06-07-ecourts-apk-teardown.md). The app is a Cordova/WebView app; its
 * request-parameter "encryption" lives in plain JS (`assets/www/js/main.js`, `main_hc.js`) and
 * is reproduced here exactly, then proven byte-identical to the app's bundled CryptoJS v3.1.2 by
 * a known-answer test (ecourts-codec.test.ts).
 *
 * The scheme is AES-128-CBC/PKCS7 with keys and an IV-prefix table hard-coded in the shipped
 * client — i.e. an obfuscation/access-control gate over PUBLIC court records, not a secret. This
 * module only *speaks the protocol*; whether to point it at the live government backend is a
 * separate, operator-owned decision (default-off; gated on legal/compliance sign-off — see the
 * source adapter and docs/runbooks/ecourts-mitm-and-codec.md). Node's built-in `crypto` matches
 * the app's CryptoJS exactly because the app passes a WordArray key (raw AES, no OpenSSL
 * salt/EVP-KDF), so no third-party crypto dependency is needed.
 *
 *   request  : params object --JSON.stringify--> AES-128-CBC(reqKey, iv) --base64-->
 *              wire = randomIvHex(16) + prefixIndex(1 digit) + base64(ciphertext)
 *              where iv = ivPrefixTable[prefixIndex] (8 bytes) ++ randomIv (8 bytes)
 *   response : wire = ivHex(32) + base64(ciphertext); AES-128-CBC(resKey, ivHex) --utf8--> JSON
 */
import { createCipheriv, createDecipheriv, randomBytes, randomInt } from "node:crypto";

/** AES-128 key for REQUEST params (hex). From main.js `encryptData` (ASCII "MbQeThWmZq4t6w9z"). */
export const ECOURTS_REQUEST_KEY_HEX = "4D6251655468576D5A7134743677397A";
/** AES-128 key for RESPONSE bodies (hex). From main.js `decodeResponse` (ASCII "2s5v8x/A?D(G+KbP"). */
export const ECOURTS_RESPONSE_KEY_HEX = "3273357638782F413F4428472B4B6250";
/**
 * The 6 candidate IV high-halves (8 bytes each, hex). `encryptData` picks one at random and
 * transmits its index as a single digit; the random low-half (8 bytes) is sent as 16 hex chars.
 * From main.js `generateGlobalIv`.
 */
export const ECOURTS_IV_PREFIX_TABLE = [
  "556A586E32723575",
  "34743777217A2543",
  "413F4428472B4B62",
  "48404D635166546A",
  "614E645267556B58",
  "655368566D597133",
] as const;

/**
 * Encodes requests and decodes responses for the eCourts mobile backend. `encrypt` is used for
 * both the `params` query value (an object) and the `Authorization: Bearer` token (a string),
 * mirroring the app's single `encryptData`.
 */
export interface EcourtsCodec {
  /** `encryptData(data)`: JSON.stringify -> AES-128-CBC -> `randomIvHex + prefixIndex + base64`. */
  encrypt(data: unknown): string;
  /** `decodeResponse(body)`: split `ivHex(32)+base64` -> AES-128-CBC decrypt -> plaintext JSON. */
  decryptResponse(body: string): string;
}

export interface EcourtsCodecOptions {
  /** Override the request key (hex). Defaults to the value shipped in the app. */
  readonly requestKeyHex?: string;
  /** Override the response key (hex). Defaults to the value shipped in the app. */
  readonly responseKeyHex?: string;
  /** Override the IV-prefix table. Defaults to the values shipped in the app. */
  readonly ivPrefixTable?: readonly string[];
  /** Returns 16 hex chars (8 random bytes). Default: CSPRNG. Injectable for deterministic tests. */
  readonly randomIvHex?: () => string;
  /** Returns an index into `ivPrefixTable`. Default: CSPRNG. Injectable for deterministic tests. */
  readonly pickPrefixIndex?: (tableLength: number) => number;
}

export function createEcourtsCodec(options: EcourtsCodecOptions = {}): EcourtsCodec {
  const requestKey = Buffer.from(options.requestKeyHex ?? ECOURTS_REQUEST_KEY_HEX, "hex");
  const responseKey = Buffer.from(options.responseKeyHex ?? ECOURTS_RESPONSE_KEY_HEX, "hex");
  const ivPrefixTable = options.ivPrefixTable ?? ECOURTS_IV_PREFIX_TABLE;
  const randomIvHex = options.randomIvHex ?? (() => randomBytes(8).toString("hex"));
  const pickPrefixIndex = options.pickPrefixIndex ?? ((length) => randomInt(0, length));

  return {
    encrypt(data) {
      const index = pickPrefixIndex(ivPrefixTable.length);
      const prefix = ivPrefixTable[index];
      if (prefix === undefined) {
        throw new Error(`eCourts codec: IV prefix index ${index} out of range`);
      }
      const lowHalf = randomIvHex();
      const iv = Buffer.from(prefix + lowHalf, "hex");
      const cipher = createCipheriv("aes-128-cbc", requestKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update(JSON.stringify(data), "utf8"),
        cipher.final(),
      ]);
      return lowHalf + index + ciphertext.toString("base64");
    },
    decryptResponse(body) {
      const trimmed = body.trim();
      const iv = Buffer.from(trimmed.slice(0, 32), "hex");
      const ciphertext = Buffer.from(trimmed.slice(32), "base64");
      const decipher = createDecipheriv("aes-128-cbc", responseKey, iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    },
  };
}

/**
 * A no-op codec for offline tests and local development: `encrypt` returns the JSON unchanged and
 * `decryptResponse` returns its input. Lets the adapter be exercised end-to-end without crypto and
 * without ever targeting the live backend.
 */
export const identityEcourtsCodec: EcourtsCodec = {
  encrypt: (data) => JSON.stringify(data),
  decryptResponse: (body) => body,
};
