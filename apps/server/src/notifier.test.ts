import { type Alert, asAlertId, asCnr } from "@nowlez/contracts";
import type { DailyBriefing } from "@nowlez/tracking";
import { FakeWhatsAppClient } from "@nowlez/whatsapp";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  Notifier,
  notificationPreferencesFromEnv,
} from "./notifier";

function alert(kind: "new-order" | "case-update"): Alert {
  return {
    id: asAlertId(`${kind}-1`),
    cnr: asCnr("C1"),
    kind,
    message: "something changed",
    createdAt: "2026-06-10T00:00:00Z",
    read: false,
  };
}

const EMPTY_BRIEFING: DailyBriefing = {
  date: "2026-06-10",
  overdue: [],
  todayHearings: [],
  tomorrowHearings: [],
  newAlerts: [],
  newAlertCount: 0,
  empty: true,
};

describe("Notifier", () => {
  it("pushes alerts to the recipient under default preferences", async () => {
    const wa = new FakeWhatsAppClient();
    const notifier = new Notifier(wa, "15551234567");
    expect(await notifier.notifyAlerts([alert("new-order")])).toBe(true);
    expect(wa.sent).toHaveLength(1);
    expect(wa.sent[0]?.to).toBe("15551234567");
    expect(wa.sent[0]?.text).toContain("new-order");
  });

  it("does nothing without a recipient", async () => {
    const wa = new FakeWhatsAppClient();
    expect(await new Notifier(wa, "").notifyAlerts([alert("new-order")])).toBe(false);
    expect(wa.sent).toHaveLength(0);
  });

  it("respects the alert-kind allow-list", async () => {
    const wa = new FakeWhatsAppClient();
    const notifier = new Notifier(wa, "x", {
      pushAlerts: true,
      alertKinds: ["case-update"],
      dailyBriefing: false,
    });
    expect(await notifier.notifyAlerts([alert("new-order")])).toBe(false);
    expect(await notifier.notifyAlerts([alert("case-update")])).toBe(true);
    expect(wa.sent).toHaveLength(1);
  });

  it("mutes alert pushes when pushAlerts is off", async () => {
    const wa = new FakeWhatsAppClient();
    const notifier = new Notifier(wa, "x", {
      pushAlerts: false,
      alertKinds: "all",
      dailyBriefing: false,
    });
    expect(await notifier.notifyAlerts([alert("new-order")])).toBe(false);
    expect(wa.sent).toHaveLength(0);
  });

  it("pushes the briefing only when enabled", async () => {
    const wa = new FakeWhatsAppClient();
    expect(await new Notifier(wa, "x").notifyBriefing(EMPTY_BRIEFING)).toBe(false);
    const on = new Notifier(wa, "x", { ...DEFAULT_NOTIFICATION_PREFERENCES, dailyBriefing: true });
    expect(await on.notifyBriefing(EMPTY_BRIEFING)).toBe(true);
    expect(wa.sent).toHaveLength(1);
  });
});

describe("notificationPreferencesFromEnv", () => {
  it("defaults to push-all and no briefing", () => {
    expect(notificationPreferencesFromEnv({})).toEqual({
      pushAlerts: true,
      alertKinds: "all",
      dailyBriefing: false,
    });
  });

  it("parses the env knobs (and drops unknown alert kinds)", () => {
    expect(
      notificationPreferencesFromEnv({
        NOWLEZ_PUSH_ALERTS: "0",
        NOWLEZ_ALERT_KINDS: "new-order, bogus",
        NOWLEZ_DAILY_BRIEFING: "1",
      }),
    ).toEqual({ pushAlerts: false, alertKinds: ["new-order"], dailyBriefing: true });
  });
});
