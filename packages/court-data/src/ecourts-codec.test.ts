import { describe, expect, it } from "vitest";
import { createEcourtsCodec, decryptRequestBlob, identityEcourtsCodec } from "./ecourts-codec";

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

  it("decryptRequestBlob decodes a captured request blob back to plaintext (known-answer)", () => {
    expect(decryptRequestBlob(KAT.request.blob)).toBe(JSON.stringify(KAT.request.data));
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

  it("reports a clear error when the response is not in the encrypted format", () => {
    const codec = createEcourtsCodec();
    // An HTML/error page or empty body — not `ivHex(32) + base64` — must not surface a raw
    // "Invalid initialization vector" crypto error.
    expect(() => codec.decryptResponse("<html>error</html>")).toThrow(
      /not in the expected encrypted format/i,
    );
    expect(() => codec.decryptResponse("")).toThrow(/not in the expected encrypted format/i);
  });
});

describe("identityEcourtsCodec", () => {
  it("passes data through as JSON for offline tests (no encryption)", () => {
    expect(identityEcourtsCodec.encrypt({ cinum: "X" })).toBe('{"cinum":"X"}');
    expect(identityEcourtsCodec.decryptResponse('{"history":{}}')).toBe('{"history":{}}');
  });
});
