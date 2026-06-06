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
  /** The unread alerts to highlight (most recent first, capped at `maxAlerts`). */
  readonly newAlerts: readonly Alert[];
  /** Total unread alerts — may exceed `newAlerts.length` when capped. */
  readonly newAlertCount: number;
  /** True when there is nothing imminent and nothing unread — a quiet day. */
  readonly empty: boolean;
}

const DEFAULT_MAX_ALERTS = 10;

/** Newest first by createdAt (ISO strings sort lexically); stable, no nested ternary. */
function byCreatedAtDesc(a: Alert, b: Alert): number {
  if (a.createdAt > b.createdAt) {
    return -1;
  }
  if (a.createdAt < b.createdAt) {
    return 1;
  }
  return 0;
}

export interface DailyBriefingOptions {
  /** Cap on highlighted unread alerts (the total is still reported). Defaults to 10. */
  readonly maxAlerts?: number;
}

/** Compose the briefing from a hearing digest and the alert feed (unread alerts are highlighted). */
export function buildDailyBriefing(
  digest: HearingDigest,
  alerts: readonly Alert[] = [],
  options: DailyBriefingOptions = {},
): DailyBriefing {
  const maxAlerts =
    options.maxAlerts !== undefined && options.maxAlerts >= 0
      ? Math.floor(options.maxAlerts)
      : DEFAULT_MAX_ALERTS;
  const inBucket = (bucket: HearingBucket): readonly HearingEntry[] =>
    digest.entries.filter((e) => e.bucket === bucket);
  const overdue = inBucket("overdue");
  const todayHearings = inBucket("today");
  const tomorrowHearings = inBucket("tomorrow");
  // Highlight only the most recent unread alerts so the daily push can't grow unbounded as older
  // unread alerts accumulate; the true total is reported separately as `newAlertCount`.
  const unread = alerts.filter((a) => !a.read).sort(byCreatedAtDesc);
  const newAlerts = unread.slice(0, maxAlerts);
  const empty =
    overdue.length === 0 &&
    todayHearings.length === 0 &&
    tomorrowHearings.length === 0 &&
    unread.length === 0;
  return {
    date: digest.today,
    overdue,
    todayHearings,
    tomorrowHearings,
    newAlerts,
    newAlertCount: unread.length,
    empty,
  };
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
  if (briefing.newAlertCount > 0) {
    lines.push(`New alerts (${briefing.newAlertCount}):`);
    for (const a of briefing.newAlerts) {
      lines.push(`• [${a.kind}] ${a.cnr}: ${a.message}`);
    }
    const hidden = briefing.newAlertCount - briefing.newAlerts.length;
    if (hidden > 0) {
      lines.push(`• …and ${hidden} more`);
    }
  }
  return lines.join("\n");
}
