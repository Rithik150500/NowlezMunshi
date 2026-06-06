import { describe, expect, it } from "vitest";
import { parseCaptureArgs, runCapture } from "./ecourts-capture";
import { identityEcourtsCodec } from "./ecourts-codec";
import type { EcourtsTransport } from "./ecourts-protocol";

describe("parseCaptureArgs", () => {
  it("treats a bare CNR as the case-history mode", () => {
    expect(parseCaptureArgs(["KLER010012342026"])).toEqual({
      command: { mode: "case", cnr: "KLER010012342026" },
      hc: false,
      raw: false,
    });
  });

  it("parses the explicit `case` subcommand with --hc / --raw", () => {
    expect(parseCaptureArgs(["case", "KLER010012342026", "--hc", "--raw"])).toEqual({
      command: { mode: "case", cnr: "KLER010012342026" },
      hc: true,
      raw: true,
    });
  });

  it("parses party search with scope, name, year (pendingDisposed defaults to Pending)", () => {
    expect(
      parseCaptureArgs(["party", "--state", "KL", "--name", "Ramesh", "--year", "2026"]),
    ).toEqual({
      command: {
        mode: "party",
        scope: { stateOrHighCourt: "KL" },
        partyName: "Ramesh",
        year: 2026,
        pendingDisposed: "Pending",
      },
      hc: false,
      raw: false,
    });
  });

  it("parses party search with full scope and an explicit --status", () => {
    const parsed = parseCaptureArgs([
      "party",
      "--state",
      "KL",
      "--dist",
      "ER",
      "--court",
      "1",
      "--name",
      "X",
      "--year",
      "2026",
      "--status",
      "Disposed",
    ]);
    expect(parsed.command).toEqual({
      mode: "party",
      scope: { stateOrHighCourt: "KL", districtOrBench: "ER", court: "1" },
      partyName: "X",
      year: 2026,
      pendingDisposed: "Disposed",
    });
  });

  it("parses case-number and cause-list modes", () => {
    expect(
      parseCaptureArgs([
        "case-number",
        "--state",
        "KL",
        "--type",
        "OS",
        "--no",
        "1234",
        "--year",
        "2026",
      ]).command,
    ).toEqual({
      mode: "case-number",
      scope: { stateOrHighCourt: "KL" },
      caseType: "OS",
      caseNumber: "1234",
      year: 2026,
    });
    expect(
      parseCaptureArgs(["cause-list", "--state", "KL", "--date", "2026-06-20"]).command,
    ).toEqual({ mode: "cause-list", scope: { stateOrHighCourt: "KL" }, date: "2026-06-20" });
  });

  it("throws a helpful error on missing required flags", () => {
    expect(() => parseCaptureArgs([])).toThrow(/CNR/i);
    expect(() => parseCaptureArgs(["party", "--state", "KL", "--year", "2026"])).toThrow(/name/i);
    expect(() => parseCaptureArgs(["party", "--name", "X", "--year", "2026"])).toThrow(/state/i);
    expect(() => parseCaptureArgs(["cause-list", "--state", "KL"])).toThrow(/date/i);
  });
});

describe("runCapture", () => {
  it("routes each mode to the right endpoint with the right params, returning the raw response", async () => {
    const calls: { url: string; params: Record<string, string> }[] = [];
    const transport: EcourtsTransport = async (url, query) => {
      calls.push({ url, params: JSON.parse(query.params ?? "{}") });
      return JSON.stringify({ ok: true });
    };
    const config = {
      baseUrl: "https://app.example/ecourt_mobile_DC/",
      codec: identityEcourtsCodec,
      transport,
    };

    await runCapture({ mode: "case", cnr: "KLER010012342026" }, config);
    await runCapture(
      {
        mode: "party",
        scope: { stateOrHighCourt: "KL" },
        partyName: "X",
        year: 2026,
        pendingDisposed: "Pending",
      },
      config,
    );
    await runCapture(
      {
        mode: "case-number",
        scope: { stateOrHighCourt: "KL" },
        caseType: "OS",
        caseNumber: "1234",
        year: 2026,
      },
      config,
    );
    const last = await runCapture(
      { mode: "cause-list", scope: { stateOrHighCourt: "KL" }, date: "2026-06-20" },
      config,
    );

    expect(calls[0]?.url).toContain("caseHistoryWebService.php");
    expect(calls[0]?.params.cinum).toBe("KLER010012342026");
    expect(calls[1]?.url).toContain("showDataWebService.php");
    expect(calls[1]?.params.pet_name).toBe("X");
    expect(calls[2]?.url).toContain("caseNumberSearch.php");
    expect(calls[2]?.params.case_number).toBe("1234");
    expect(calls[3]?.url).toContain("causeListWebService.php");
    expect(calls[3]?.params.date).toBe("2026-06-20");
    expect(last).toEqual({ ok: true });
  });
});
