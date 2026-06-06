import { describe, expect, it } from "vitest";
import {
  caseHistoryRequest,
  caseNumberSearchRequest,
  causeListRequest,
  partySearchRequest,
  type RequestFlags,
} from "./ecourts-requests";

const FLAGS: RequestFlags = { languageFlag: "english", bilingualFlag: "0" };

describe("eCourts request builders", () => {
  it("caseHistoryRequest sends the CNR as `cinum` with the language flags", () => {
    expect(caseHistoryRequest("KLER010012342026", FLAGS)).toEqual({
      endpoint: "caseHistoryWebService.php",
      params: { cinum: "KLER010012342026", language_flag: "english", bilingual_flag: "0" },
    });
  });

  it("partySearchRequest sends pet_name + pendingDisposed + year + scope", () => {
    const req = partySearchRequest(
      {
        scope: { stateOrHighCourt: "KL", districtOrBench: "ER", court: "1" },
        partyName: "Ramesh",
        year: 2026,
        pendingDisposed: "Disposed",
      },
      FLAGS,
    );
    expect(req.endpoint).toBe("showDataWebService.php");
    // Search fans out across a court complex's establishments — `court_code_arr`, not `court_code`.
    expect(req.params).toMatchObject({
      state_code: "KL",
      dist_code: "ER",
      court_code_arr: "1",
      pet_name: "Ramesh",
      pendingDisposed: "Disposed",
      year: "2026",
      language_flag: "english",
    });
    expect(req.params.court_code).toBeUndefined();
  });

  it("partySearchRequest defaults pendingDisposed to Pending and omits unset scope levels", () => {
    const req = partySearchRequest(
      { scope: { stateOrHighCourt: "KL" }, partyName: "X", year: 2026 },
      FLAGS,
    );
    expect(req.params.pendingDisposed).toBe("Pending");
    expect(req.params.dist_code).toBeUndefined();
    expect(req.params.court_code_arr).toBeUndefined();
  });

  it("caseNumberSearchRequest uses the app's `case_number` key + `court_code_arr`", () => {
    const req = caseNumberSearchRequest(
      {
        scope: { stateOrHighCourt: "KL", districtOrBench: "ER", court: "12,13" },
        caseType: "OS",
        caseNumber: "1234",
        year: 2026,
      },
      FLAGS,
    );
    expect(req.endpoint).toBe("caseNumberSearch.php");
    expect(req.params).toMatchObject({
      case_type: "OS",
      case_number: "1234",
      year: "2026",
      court_code_arr: "12,13",
    });
    expect(req.params.reg_no).toBeUndefined();
    expect(req.params.court_code).toBeUndefined();
  });

  it("causeListRequest sends the date + scope", () => {
    const req = causeListRequest({ scope: { stateOrHighCourt: "KL" }, date: "2026-06-20" }, FLAGS);
    expect(req.endpoint).toBe("causeListWebService.php");
    expect(req.params).toMatchObject({ state_code: "KL", date: "2026-06-20" });
  });
});
