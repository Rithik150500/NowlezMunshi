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

  it("parses the complexes (court-code discovery) mode", () => {
    expect(parseCaptureArgs(["complexes", "--state", "4", "--dist", "2"]).command).toEqual({
      mode: "complexes",
      state: "4",
      dist: "2",
    });
    expect(() => parseCaptureArgs(["complexes", "--state", "4"])).toThrow(/dist/i);
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

    // Each runCapture bootstraps via appReleaseWebService.php first; assert on the operation calls.
    const ops = calls.filter((c) => !c.url.includes("appReleaseWebService.php"));
    expect(ops[0]?.url).toContain("caseHistoryWebService.php");
    expect(ops[0]?.params.cinum).toBe("KLER010012342026");
    expect(ops[1]?.url).toContain("showDataWebService.php");
    expect(ops[1]?.params.pet_name).toBe("X");
    expect(ops[2]?.url).toContain("caseNumberSearch.php");
    expect(ops[2]?.params.case_number).toBe("1234");
    expect(ops[3]?.url).toContain("causeListWebService.php");
    expect(ops[3]?.params.date).toBe("2026-06-20");
    expect(last).toEqual({ ok: true });
  });

  it("routes the complexes mode to courtEstWebService.php with fillCourtComplex", async () => {
    let url = "";
    let params: Record<string, string> = {};
    const transport: EcourtsTransport = async (u, q) => {
      url = u;
      params = JSON.parse(q.params ?? "{}");
      return JSON.stringify([{ njdg_est_code: "X", court_complex_name: "Y" }]);
    };
    await runCapture(
      { mode: "complexes", state: "4", dist: "2" },
      { baseUrl: "https://app.example/ecourt_mobile_DC/", codec: identityEcourtsCodec, transport },
    );
    expect(url).toContain("courtEstWebService.php");
    expect(params).toMatchObject({
      action_code: "fillCourtComplex",
      state_code: "4",
      dist_code: "2",
    });
  });
});
