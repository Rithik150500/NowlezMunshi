import { asCnr, asDeadlineId, type Deadline } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildDeadlineDigest,
  computeLimitationDeadline,
  LIMITATION_RULES,
} from "./deadlines";

const deadline = (id: string, dueDate: string, done = false): Deadline => ({
  id: asDeadlineId(id),
  cnr: asCnr("C1"),
  title: `D ${id}`,
  dueDate,
  done,
  createdAt: "2026-06-01T00:00:00Z",
});

describe("limitation calculator", () => {
  it("adds whole days to a base date", () => {
    expect(addDays("2026-06-10", 90)).toBe("2026-09-08");
    expect(addDays("2026-06-10", 30)).toBe("2026-07-10");
    expect(addDays("not a date", 30)).toBeUndefined();
  });

  it("computes a due date from a rule (and rejects an unknown rule)", () => {
    const computed = computeLimitationDeadline("appeal-high-court", "2026-06-10");
    expect(computed?.dueDate).toBe("2026-09-08");
    expect(computed?.rule.days).toBe(90);
    expect(computeLimitationDeadline("bogus", "2026-06-10")).toBeUndefined();
    expect(LIMITATION_RULES.length).toBeGreaterThan(0);
  });
});

describe("buildDeadlineDigest", () => {
  it("buckets pending deadlines relative to today and drops done ones", () => {
    const digest = buildDeadlineDigest(
      [
        deadline("d-overdue", "2026-06-05"),
        deadline("d-today", "2026-06-10"),
        deadline("d-soon", "2026-06-15"),
        deadline("d-later", "2026-07-30"),
        deadline("d-done", "2026-06-11", true),
      ],
      { today: "2026-06-10" },
    );

    expect(digest.today).toBe("2026-06-10");
    expect(digest.counts).toEqual({ overdue: 1, today: 1, tomorrow: 0, thisWeek: 1, later: 1 });
    expect(digest.entries.map((e) => e.deadline.id)).toEqual([
      "d-overdue",
      "d-today",
      "d-soon",
      "d-later",
    ]);
    expect(digest.entries.map((e) => e.deadline.id)).not.toContain("d-done");
  });

  it("defaults the reference day to IST across the midnight boundary", () => {
    // 2026-06-06 19:00 UTC == 2026-06-07 00:30 IST.
    const now = new Date("2026-06-06T19:00:00Z");
    expect(buildDeadlineDigest([], { now }).today).toBe("2026-06-07");
    expect(buildDeadlineDigest([], { now, timeZone: "UTC" }).today).toBe("2026-06-06");
  });
});
