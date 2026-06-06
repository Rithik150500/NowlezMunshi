import { createDecipheriv } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createEcourtsCodec,
  ECOURTS_IV_PREFIX_TABLE,
  ECOURTS_REQUEST_KEY_HEX,
  identityEcourtsCodec,
} from "./ecourts-codec";

/**
 * Known-answer vectors minted from the eCourts app's OWN bundled CryptoJS v3.1.2
 * (assets/www/js/vendor/cryptojs, run under Node's vm). A passing KAT proves the Node-`crypto`
 * reimplementation is byte-identical to what the app actually puts on the wire — fully offline,
 * no live call to the government backend. See docs/research/2026-06-07-ecourts-apk-teardown.md.
 */
const KAT = {
  request: {
    data: { case_no: "KLER010012342026", language_flag: "english" },
    randomIvHex: "0011223344556677",
    prefixIndex: 0, // -> IV prefix 556A586E32723575
    blob: "00112233445566770vbl1+JhdjSgQPtr495eLL7or62mM5w1QxDSzKVthgC/em9wQSxAHadqzb5nYwUudlo29jZjDw2EtKtCtACKpBA==",
  },
  response: {
    body: "00112233445566778899aabbccddeeffTSJqJ5+cxL+gqgsAab5lxIy6qYlfRTeLcOYlWm075air00tmxXcqW6vVXUY5gmD3",
    plaintext: '{"token":"JWT123","status":"Y","cases":[]}',
  },
};

/** Decrypt a request blob the way the eCourts SERVER would — used only to round-trip-verify here. */
function decryptRequestBlob(blob: string): string {
  const randomIvHex = blob.slice(0, 16);
  const index = Number(blob.slice(16, 17));
  const prefix = ECOURTS_IV_PREFIX_TABLE[index];
  if (prefix === undefined) {
    throw new Error(`bad prefix index ${index}`);
  }
  const iv = Buffer.from(prefix + randomIvHex, "hex");
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(ECOURTS_REQUEST_KEY_HEX, "hex"), iv);
  const ct = Buffer.from(blob.slice(17), "base64");
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

describe("createEcourtsCodec", () => {
  it("encrypts request params byte-identically to the app's CryptoJS (known-answer)", () => {
    const codec = createEcourtsCodec({
      randomIvHex: () => KAT.request.randomIvHex,
      pickPrefixIndex: () => KAT.request.prefixIndex,
    });
    expect(codec.encrypt(KAT.request.data)).toBe(KAT.request.blob);
  });

  it("decrypts an app-format response body (known-answer)", () => {
    const codec = createEcourtsCodec();
    expect(codec.decryptResponse(KAT.response.body)).toBe(KAT.response.plaintext);
  });

  it("round-trips any params object through the real request key + IV table", () => {
    const codec = createEcourtsCodec();
    const data = { state_code: "KL", dist_code: "ER", cinum: "KLER010012342026" };
    const recovered = JSON.parse(decryptRequestBlob(codec.encrypt(data)));
    expect(recovered).toEqual(data);
  });

  it("uses a fresh random IV per call, so two encryptions of the same data differ", () => {
    const codec = createEcourtsCodec();
    expect(codec.encrypt({ a: 1 })).not.toBe(codec.encrypt({ a: 1 }));
  });

  it("encrypts the (empty) bearer token the way the app bootstraps auth", () => {
    const codec = createEcourtsCodec();
    // The app sends `Bearer encryptData(jwttoken)` with jwttoken="" on the first call.
    expect(decryptRequestBlob(codec.encrypt(""))).toBe('""');
  });
});

describe("identityEcourtsCodec", () => {
  it("passes data through as JSON for offline tests (no encryption)", () => {
    expect(identityEcourtsCodec.encrypt({ cinum: "X" })).toBe('{"cinum":"X"}');
    expect(identityEcourtsCodec.decryptResponse('{"history":{}}')).toBe('{"history":{}}');
  });
});
