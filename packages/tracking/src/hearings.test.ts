import { asCnr, type Case } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { buildHearingDigest, parseHearingDate } from "./hearings";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

function caseAt(
  cnr: string,
  nextHearingDate: string | undefined,
  opts: { tracking?: boolean; status?: string } = {},
): Case {
  return {
    cnr: asCnr(cnr),
    court: COURT,
    details: {
      parties: `${cnr} parties`,
      caseNumber: "1",
      ...(nextHearingDate ? { nextHearingDate } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    },
    tracking: opts.tracking ?? true,
    orders: [],
    files: [],
  };
}

// A fixed "today" so the buckets are deterministic; horizon defaults to 7.
const TODAY = "2026-06-10";

const CASES: readonly Case[] = [
  caseAt("C-OVERDUE", "2026-06-05"),
  caseAt("C-TODAY", "2026-06-10"),
  caseAt("C-TOMORROW", "2026-06-11"),
  caseAt("C-DMY", "12-06-2026"), // DD-MM-YYYY -> 2026-06-12 (+2)
  caseAt("C-THISWEEK", "2026-06-15"), // +5
  caseAt("C-LATER", "2026-06-30"), // +20
  caseAt("C-GARBAGE", "sometime soon"), // unparseable -> unscheduled
  caseAt("C-NODATE", undefined), // no date -> unscheduled
  caseAt("C-DISPOSED", "2026-06-11", { status: "Disposed" }), // excluded (disposed)
  caseAt("C-UNTRACKED", "2026-06-11", { tracking: false }), // excluded (not tracked)
];

describe("buildHearingDigest", () => {
  it("buckets tracked, active cases relative to today and excludes disposed / untracked", () => {
    const digest = buildHearingDigest(CASES, { today: TODAY });

    expect(digest.today).toBe(TODAY);
    expect(digest.horizonDays).toBe(7);
    expect(digest.counts).toEqual({
      overdue: 1,
      today: 1,
      tomorrow: 1,
      thisWeek: 2,
      later: 1,
      unscheduled: 2,
    });
    // 8 entries (the disposed and untracked cases are dropped).
    expect(digest.entries).toHaveLength(8);
    expect(digest.entries.map((e) => e.cnr)).not.toContain("C-DISPOSED");
    expect(digest.entries.map((e) => e.cnr)).not.toContain("C-UNTRACKED");
  });

  it("sorts by date ascending (overdue first), unscheduled last", () => {
    const digest = buildHearingDigest(CASES, { today: TODAY });
    expect(digest.entries.map((e) => e.cnr)).toEqual([
      "C-OVERDUE",
      "C-TODAY",
      "C-TOMORROW",
      "C-DMY",
      "C-THISWEEK",
      "C-LATER",
      "C-GARBAGE",
      "C-NODATE",
    ]);
  });

  it("computes daysUntil and normalises the date for each scheduled entry", () => {
    const digest = buildHearingDigest(CASES, { today: TODAY });
    const byCnr = new Map(digest.entries.map((e) => [e.cnr, e]));
    expect(byCnr.get(asCnr("C-OVERDUE"))?.daysUntil).toBe(-5);
    expect(byCnr.get(asCnr("C-TODAY"))?.daysUntil).toBe(0);
    expect(byCnr.get(asCnr("C-TOMORROW"))?.daysUntil).toBe(1);
    expect(byCnr.get(asCnr("C-DMY"))).toMatchObject({ date: "2026-06-12", daysUntil: 2 });
    expect(byCnr.get(asCnr("C-LATER"))?.daysUntil).toBe(20);
    // Unscheduled entries keep the raw value but carry no parsed date / daysUntil.
    expect(byCnr.get(asCnr("C-GARBAGE"))).toMatchObject({
      bucket: "unscheduled",
      nextHearingDate: "sometime soon",
    });
    expect(byCnr.get(asCnr("C-GARBAGE"))?.date).toBeUndefined();
  });

  it("respects a custom horizon (a wider 'this week')", () => {
    const digest = buildHearingDigest(CASES, { today: TODAY, horizonDays: 30 });
    // +20 (C-LATER) now falls inside the 30-day window.
    expect(digest.counts.later).toBe(0);
    expect(digest.counts.thisWeek).toBe(3);
  });

  it("defaults today to the current day and horizon to 7 when unspecified", () => {
    const digest = buildHearingDigest([caseAt("C1", "2026-06-20")]);
    expect(digest.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(digest.horizonDays).toBe(7);
  });

  it("defaults the reference day to IST (Asia/Kolkata), not UTC, across the midnight boundary", () => {
    // 2026-06-06 19:00 UTC == 2026-06-07 00:30 IST, so the Indian calendar day is the 7th.
    const now = new Date("2026-06-06T19:00:00Z");
    expect(buildHearingDigest([], { now }).today).toBe("2026-06-07");
    expect(buildHearingDigest([], { now, timeZone: "UTC" }).today).toBe("2026-06-06");
  });
});

describe("parseHearingDate", () => {
  it("accepts ISO dates (with or without a time suffix)", () => {
    expect(parseHearingDate("2026-06-20")).toBe("2026-06-20");
    expect(parseHearingDate("2026-06-20T10:30:00Z")).toBe("2026-06-20");
  });

  it("accepts DD-MM-YYYY and DD/MM/YYYY", () => {
    expect(parseHearingDate("05-06-2026")).toBe("2026-06-05");
    expect(parseHearingDate("5/6/2026")).toBe("2026-06-05");
  });

  it("accepts non-zero-padded ISO month/day", () => {
    expect(parseHearingDate("2026-6-5")).toBe("2026-06-05");
    expect(parseHearingDate("2026-06-5")).toBe("2026-06-05");
  });

  it("rejects impossible or unrecognised values", () => {
    expect(parseHearingDate("31-02-2026")).toBeUndefined();
    expect(parseHearingDate("2026-13-01")).toBeUndefined();
    expect(parseHearingDate("next week")).toBeUndefined();
    expect(parseHearingDate("")).toBeUndefined();
    expect(parseHearingDate(undefined)).toBeUndefined();
  });
});
