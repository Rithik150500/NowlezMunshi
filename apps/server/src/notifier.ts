import type { Alert, AlertKind, WhatsAppClient } from "@nowlez/contracts";
import { type DailyBriefing, formatDailyBriefing } from "@nowlez/tracking";

/**
 * Single-tenant notification preferences (docs/alerts-and-tracking.md#notifications). Per-user
 * preferences and multi-recipient routing await the auth/tenancy model (open-questions.md); for now
 * one operator's WhatsApp number is the push target and these flags shape what reaches it.
 */
export interface NotificationPreferences {
  /** Push alert-worthy changes to WhatsApp as they happen. */
  readonly pushAlerts: boolean;
  /** Which alert kinds to push: "all", or an allow-list. */
  readonly alertKinds: "all" | readonly AlertKind[];
  /** Push the daily briefing on each refresh cycle. */
  readonly dailyBriefing: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  pushAlerts: true,
  alertKinds: "all",
  dailyBriefing: false,
};

const ALERT_KINDS: readonly AlertKind[] = ["new-order", "case-update"];

/**
 * Read notification preferences from the environment:
 * `NOWLEZ_PUSH_ALERTS` (default on; `0`/`false` to mute), `NOWLEZ_ALERT_KINDS` (comma-separated
 * allow-list; unset = all), and `NOWLEZ_DAILY_BRIEFING` (`1`/`true` to push the morning briefing).
 */
export function notificationPreferencesFromEnv(
  env: Record<string, string | undefined> = process.env,
): NotificationPreferences {
  const kinds = (env.NOWLEZ_ALERT_KINDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((k): k is AlertKind => (ALERT_KINDS as readonly string[]).includes(k));
  return {
    pushAlerts: env.NOWLEZ_PUSH_ALERTS !== "0" && env.NOWLEZ_PUSH_ALERTS !== "false",
    alertKinds: kinds.length > 0 ? kinds : "all",
    dailyBriefing: env.NOWLEZ_DAILY_BRIEFING === "1" || env.NOWLEZ_DAILY_BRIEFING === "true",
  };
}

/**
 * Routes notifications to the configured channel(s). Today that is a single WhatsApp recipient (the
 * in-app alert feed is persisted separately by the AlertStore); the preferences decide what is
 * pushed. Best-effort: a channel that is off, or has no recipient, is simply not used.
 */
export class Notifier {
  constructor(
    private readonly whatsApp: WhatsAppClient,
    private readonly recipient: string,
    private readonly prefs: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES,
  ) {}

  private selectAlerts(alerts: readonly Alert[]): readonly Alert[] {
    if (this.prefs.alertKinds === "all") {
      return alerts;
    }
    const allow = new Set<string>(this.prefs.alertKinds);
    return alerts.filter((a) => allow.has(a.kind));
  }

  /** Push new alert-worthy changes over WhatsApp (best-effort). Returns whether a message was sent. */
  async notifyAlerts(alerts: readonly Alert[]): Promise<boolean> {
    if (!this.recipient || !this.prefs.pushAlerts) {
      return false;
    }
    const selected = this.selectAlerts(alerts);
    if (selected.length === 0) {
      return false;
    }
    const summary = selected.map((a) => `• [${a.kind}] ${a.cnr}: ${a.message}`).join("\n");
    await this.whatsApp.sendMessage(this.recipient, `NowLez alerts:\n${summary}`);
    return true;
  }

  /** Push the daily briefing over WhatsApp when enabled (best-effort). Returns whether it was sent. */
  async notifyBriefing(briefing: DailyBriefing): Promise<boolean> {
    if (!this.recipient || !this.prefs.dailyBriefing) {
      return false;
    }
    await this.whatsApp.sendMessage(this.recipient, formatDailyBriefing(briefing));
    return true;
  }
}
