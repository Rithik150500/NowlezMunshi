import { type Alert, asAlertId, asCnr, type Case } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { buildDailyBriefing, formatDailyBriefing } from "./briefing";
import { buildHearingDigest } from "./hearings";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };
const TODAY = "2026-06-10";

function caseAt(cnr: string, nextHearingDate: string): Case {
  return {
    cnr: asCnr(cnr),
    court: COURT,
    details: { parties: `${cnr} parties`, nextHearingDate },
    tracking: true,
    orders: [],
    files: [],
  };
}

function alert(id: string, read: boolean): Alert {
  return {
    id: asAlertId(id),
    cnr: asCnr("C-TODAY"),
    kind: "new-order",
    message: "New order O1",
    createdAt: "2026-06-10T00:00:00Z",
    read,
  };
}

describe("buildDailyBriefing", () => {
  it("collects the imminent hearings and the unread alerts", () => {
    const digest = buildHearingDigest(
      [
        caseAt("C-OVERDUE", "2026-06-05"),
        caseAt("C-TODAY", "2026-06-10"),
        caseAt("C-TOMORROW", "2026-06-11"),
        caseAt("C-LATER", "2026-06-30"),
      ],
      { today: TODAY },
    );
    const briefing = buildDailyBriefing(digest, [alert("a1", false), alert("a2", true)]);

    expect(briefing.date).toBe(TODAY);
    expect(briefing.overdue.map((e) => e.cnr)).toEqual(["C-OVERDUE"]);
    expect(briefing.todayHearings.map((e) => e.cnr)).toEqual(["C-TODAY"]);
    expect(briefing.tomorrowHearings.map((e) => e.cnr)).toEqual(["C-TOMORROW"]);
    // Only the unread alert is highlighted; the "later" hearing is not in the briefing.
    expect(briefing.newAlerts).toHaveLength(1);
    expect(briefing.empty).toBe(false);

    const text = formatDailyBriefing(briefing);
    expect(text).toContain("⚠ Overdue (1)");
    expect(text).toContain("Today (1)");
    expect(text).toContain("Tomorrow (1)");
    expect(text).toContain("New alerts (1)");
    expect(text).not.toContain("Later");
  });

  it("is empty (and says so) when nothing is imminent and no alert is unread", () => {
    const digest = buildHearingDigest([caseAt("C-LATER", "2026-06-30")], { today: TODAY });
    const briefing = buildDailyBriefing(digest, [alert("a1", true)]);
    expect(briefing.empty).toBe(true);
    expect(formatDailyBriefing(briefing)).toContain("all clear");
  });
});
