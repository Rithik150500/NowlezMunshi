import {
  type Alert,
  asAlertId,
  asClientId,
  asCnr,
  type Case,
  type Client,
} from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { buildClientUpdate, formatClientUpdate } from "./client-update";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };
const TODAY = "2026-06-10";
const CLIENT: Client = { id: asClientId("c1"), name: "Asha" };

const caseAt = (cnr: string, nextHearingDate: string, parties: string): Case => ({
  cnr: asCnr(cnr),
  court: COURT,
  details: { parties, nextHearingDate },
  tracking: true,
  orders: [],
  files: [],
});

const alert = (cnr: string, read: boolean): Alert => ({
  id: asAlertId(`${cnr}-a`),
  cnr: asCnr(cnr),
  kind: "new-order",
  message: `New order on ${cnr}`,
  createdAt: "2026-06-10T00:00:00Z",
  read,
});

describe("buildClientUpdate", () => {
  it("summarises the client's near-term hearings and unread alerts", () => {
    const cases = [
      caseAt("C-1", "2026-06-11", "Asha vs State"), // tomorrow -> near-term
      caseAt("C-2", "2026-06-30", "Asha vs Bank"), // later -> excluded
    ];
    const update = buildClientUpdate(CLIENT, cases, [alert("C-1", false), alert("C-2", true)], {
      today: TODAY,
    });

    expect(update.clientName).toBe("Asha");
    expect(update.upcoming.map((e) => e.cnr)).toEqual(["C-1"]);
    expect(update.recentAlerts).toHaveLength(1); // only the unread one, on a client case
    expect(update.empty).toBe(false);

    const text = formatClientUpdate(update);
    expect(text).toContain("Dear Asha");
    expect(text).toContain("Upcoming hearings:");
    expect(text).toContain("sent via NowLez");
  });

  it("is empty (and polite) when there is nothing to report", () => {
    const update = buildClientUpdate(CLIENT, [caseAt("C-9", "2026-12-31", "Asha vs X")], [], {
      today: TODAY,
    });
    expect(update.empty).toBe(true);
    expect(formatClientUpdate(update)).toContain("no upcoming hearings");
  });
});
