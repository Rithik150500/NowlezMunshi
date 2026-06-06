import { describe, expect, it } from "vitest";
import { mapCourtComplexes } from "./ecourts-capture";

describe("mapCourtComplexes", () => {
  it("maps the courtComplex array to a clean {code, name, complexCode} list", () => {
    const decoded = {
      courtComplex: [
        {
          njdg_est_code: 3,
          court_complex_name: "Munsiff Court Ernakulam",
          complex_code: "1040018-3",
        },
        {
          njdg_est_code: "33,34,35,36,60",
          court_complex_name: "DISTRICT COURT ANNEX, KALOOR,",
          complex_code: 1040011,
        },
      ],
      token: "jwt",
    };
    expect(mapCourtComplexes(decoded)).toEqual([
      { code: "3", name: "Munsiff Court Ernakulam", complexCode: "1040018-3" },
      { code: "33,34,35,36,60", name: "DISTRICT COURT ANNEX, KALOOR,", complexCode: "1040011" },
    ]);
  });

  it("accepts a bare array and skips entries missing a code or name", () => {
    const decoded = [
      { njdg_est_code: 1, court_complex_name: "District Court", complex_code: "x" },
      { njdg_est_code: 2 }, // no name -> skipped
      { court_complex_name: "no code" }, // no code -> skipped
    ];
    expect(mapCourtComplexes(decoded)).toEqual([
      { code: "1", name: "District Court", complexCode: "x" },
    ]);
  });

  it("returns [] for an unexpected shape", () => {
    expect(mapCourtComplexes({})).toEqual([]);
    expect(mapCourtComplexes(null)).toEqual([]);
    expect(mapCourtComplexes("nope")).toEqual([]);
  });
});
