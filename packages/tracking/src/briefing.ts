/**
 * The **daily briefing** (docs/alerts-and-tracking.md#the-daily-briefing): one summary that
 * answers "what does my day look like?" by composing the [hearing digest](./hearings.ts) (the
 * imminent buckets) with the **unread alerts**. It is what a notification channel pushes each
 * morning, and what the CLI / WhatsApp `briefing` commands render. Pure: it derives from already
 * stored data, with no eCourts call.
 */
import type { Alert } from "@nowlez/contracts";
import type { HearingBucket, HearingDigest, HearingEntry } from "./hearings";

export interface DailyBriefing {
  /** The day (YYYY-MM-DD) the briefing was composed for. */
  readonly date: string;
  readonly overdue: readonly HearingEntry[];
  readonly todayHearings: readonly HearingEntry[];
  readonly tomorrowHearings: readonly HearingEntry[];
  /** The unread alerts to highlight. */
  readonly newAlerts: readonly Alert[];
  /** True when there is nothing imminent and nothing unread — a quiet day. */
  readonly empty: boolean;
}

/** Compose the briefing from a hearing digest and the alert feed (unread alerts are highlighted). */
export function buildDailyBriefing(
  digest: HearingDigest,
  alerts: readonly Alert[] = [],
): DailyBriefing {
  const inBucket = (bucket: HearingBucket): readonly HearingEntry[] =>
    digest.entries.filter((e) => e.bucket === bucket);
  const overdue = inBucket("overdue");
  const todayHearings = inBucket("today");
  const tomorrowHearings = inBucket("tomorrow");
  const newAlerts = alerts.filter((a) => !a.read);
  const empty =
    overdue.length === 0 &&
    todayHearings.length === 0 &&
    tomorrowHearings.length === 0 &&
    newAlerts.length === 0;
  return { date: digest.today, overdue, todayHearings, tomorrowHearings, newAlerts, empty };
}

/** Render the briefing as plain text — shared by the WhatsApp push, the CLI, and WhatsApp commands. */
export function formatDailyBriefing(briefing: DailyBriefing): string {
  if (briefing.empty) {
    return `NowLez briefing — ${briefing.date}: all clear. No hearings today or tomorrow, and no new alerts.`;
  }
  const lines = [`NowLez briefing — ${briefing.date}:`];
  const section = (title: string, entries: readonly HearingEntry[]): void => {
    if (entries.length === 0) {
      return;
    }
    lines.push(`${title} (${entries.length}):`);
    for (const e of entries) {
      lines.push(`• ${e.cnr}${e.date ? ` (${e.date})` : ""} ${e.parties ?? ""}`.trimEnd());
    }
  };
  section("⚠ Overdue", briefing.overdue);
  section("Today", briefing.todayHearings);
  section("Tomorrow", briefing.tomorrowHearings);
  if (briefing.newAlerts.length > 0) {
    lines.push(`New alerts (${briefing.newAlerts.length}):`);
    for (const a of briefing.newAlerts) {
      lines.push(`• [${a.kind}] ${a.cnr}: ${a.message}`);
    }
  }
  return lines.join("\n");
}
