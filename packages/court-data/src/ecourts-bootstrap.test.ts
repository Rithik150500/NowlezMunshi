import { describe, expect, it } from "vitest";
import { identityEcourtsCodec } from "./ecourts-codec";
import { type EcourtsTransport, ecourtsRequest } from "./ecourts-protocol";
import { ecourtsUid } from "./ecourts-requests";

const UID = "324456:in.gov.ecourts.eCourtsServices";

describe("ecourtsRequest — 401 token bootstrap", () => {
  it("retries once with the uid added when the backend returns status_code 401", async () => {
    const seen: Record<string, string>[] = [];
    let call = 0;
    const transport: EcourtsTransport = async (_url, query) => {
      seen.push(JSON.parse(query.params ?? "{}"));
      call += 1;
      return call === 1
        ? JSON.stringify({ status: "N", status_code: "401", Msg: "unauthorized" })
        : JSON.stringify({ history: { cnr: "X" }, token: "T1" });
    };

    const result = await ecourtsRequest({
      url: "u",
      params: { cinum: "X" },
      token: "",
      uid: UID,
      codec: identityEcourtsCodec,
      transport,
    });

    expect(call).toBe(2);
    expect(seen[0]?.uid).toBeUndefined(); // first call carries no uid
    expect(seen[1]?.uid).toBe(UID); // retry adds the uid
    expect(seen[1]?.cinum).toBe("X"); // original params preserved
    expect((result.decoded as { history: { cnr: string } }).history.cnr).toBe("X");
    expect(result.token).toBe("T1");
  });

  it("does not retry when no uid is supplied", async () => {
    let call = 0;
    const transport: EcourtsTransport = async () => {
      call += 1;
      return JSON.stringify({ status: "N", status_code: "401" });
    };
    await ecourtsRequest({
      url: "u",
      params: {},
      token: "",
      codec: identityEcourtsCodec,
      transport,
    });
    expect(call).toBe(1);
  });

  it("retries at most once (a second 401 is returned, not looped)", async () => {
    let call = 0;
    const transport: EcourtsTransport = async () => {
      call += 1;
      return JSON.stringify({ status: "N", status_code: "401" });
    };
    const result = await ecourtsRequest({
      url: "u",
      params: {},
      token: "",
      uid: UID,
      codec: identityEcourtsCodec,
      transport,
    });
    expect(call).toBe(2);
    expect((result.decoded as { status_code: string }).status_code).toBe("401");
  });

  it("does not retry on a normal (non-401) response", async () => {
    let call = 0;
    const transport: EcourtsTransport = async () => {
      call += 1;
      return JSON.stringify({ history: {} });
    };
    await ecourtsRequest({
      url: "u",
      params: {},
      token: "",
      uid: UID,
      codec: identityEcourtsCodec,
      transport,
    });
    expect(call).toBe(1);
  });
});

describe("ecourtsUid", () => {
  it("builds deviceId:packageName with the app's package default", () => {
    expect(ecourtsUid({ deviceId: "324456" })).toBe("324456:in.gov.ecourts.eCourtsServices");
    expect(ecourtsUid({ deviceId: "a", packageName: "x.y" })).toBe("a:x.y");
  });
});
