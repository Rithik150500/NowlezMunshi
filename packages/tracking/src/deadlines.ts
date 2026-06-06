/**
 * Deadlines & limitation (docs/deadlines.md). Two pieces:
 *  - a **limitation calculator** — add a period to a base date to get a due date, with a small
 *    **provisional** catalogue of common Indian limitation/filing periods; and
 *  - a **deadline digest** — the standing "never miss a deadline" companion to the
 *    [hearing digest](./hearings.ts): bucket pending deadlines relative to today.
 *
 * The catalogue is **illustrative, not legal advice** — the exact periods and their triggers need a
 * lawyer's sign-off before any real use (open-questions.md). The math is pure and timezone-aware.
 */
import type { Deadline } from "@nowlez/contracts";
import { parseHearingDate } from "./hearings";

const MS_PER_DAY = 86_400_000;
const DEFAULT_HORIZON_DAYS = 14;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

// --- Limitation calculator ---

export interface LimitationRule {
  readonly id: string;
  readonly label: string;
  /** Limitation period in days from the base date. */
  readonly days: number;
}

/**
 * PROVISIONAL catalogue of common Indian limitation / filing periods. **Illustrative only — not
 * legal advice.** Real periods, their triggers, exclusions (e.g. time for obtaining a certified
 * copy), and condonation all need a lawyer's confirmation before any real use.
 */
export const LIMITATION_RULES: readonly LimitationRule[] = [
  { id: "appeal-high-court", label: "Appeal to High Court", days: 90 },
  { id: "appeal-district-court", label: "Appeal to District Court", days: 30 },
  { id: "second-appeal", label: "Second appeal (High Court)", days: 90 },
  { id: "revision", label: "Revision", days: 90 },
  { id: "review", label: "Review", days: 30 },
  { id: "written-statement", label: "Written statement (CPC; extendable)", days: 30 },
];

/** Add whole days to a base date (YYYY-MM-DD or any value `parseHearingDate` accepts). */
export function addDays(baseDate: string, days: number): string | undefined {
  const base = parseHearingDate(baseDate);
  if (!base || !Number.isFinite(days)) {
    return undefined;
  }
  return new Date(Date.parse(`${base}T00:00:00Z`) + Math.trunc(days) * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

export interface ComputedDeadline {
  readonly rule: LimitationRule;
  readonly baseDate: string;
  readonly dueDate: string;
}

/** Compute a due date from a limitation-rule id and a base date; undefined if either is invalid. */
export function computeLimitationDeadline(
  ruleId: string,
  baseDate: string,
): ComputedDeadline | undefined {
  const rule = LIMITATION_RULES.find((r) => r.id === ruleId);
  const base = parseHearingDate(baseDate);
  const dueDate = rule && base ? addDays(base, rule.days) : undefined;
  if (!rule || !base || !dueDate) {
    return undefined;
  }
  return { rule, baseDate: base, dueDate };
}

// --- Deadline digest ---

export type DeadlineBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later";

export interface DeadlineEntry {
  readonly deadline: Deadline;
  /** Whole days from today (negative = overdue). */
  readonly daysUntil: number;
  readonly bucket: DeadlineBucket;
}

export interface DeadlineDigest {
  readonly today: string;
  readonly horizonDays: number;
  /** Pending (not-done) deadlines, sorted by due date ascending (overdue first). */
  readonly entries: readonly DeadlineEntry[];
  readonly counts: Readonly<Record<DeadlineBucket, number>>;
}

export interface DeadlineDigestOptions {
  /** Reference day; an ISO date or timestamp. Defaults to the current day in `timeZone`. */
  readonly today?: string;
  /** The upcoming window treated as "this week/fortnight". Defaults to 14 days. */
  readonly horizonDays?: number;
  /** IANA timezone for the default reference day. Defaults to Asia/Kolkata. */
  readonly timeZone?: string;
  /** The instant used to derive the default day (injectable for tests). Defaults to now. */
  readonly now?: Date;
}

/** The calendar day (YYYY-MM-DD) for an instant in a timezone — en-CA formats as ISO. */
function currentDayIn(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / MS_PER_DAY,
  );
}

function bucketFor(daysUntil: number, horizonDays: number): DeadlineBucket {
  if (daysUntil < 0) {
    return "overdue";
  }
  if (daysUntil === 0) {
    return "today";
  }
  if (daysUntil === 1) {
    return "tomorrow";
  }
  if (daysUntil <= horizonDays) {
    return "thisWeek";
  }
  return "later";
}

/**
 * Build the deadline digest: bucket the **pending** deadlines (done ones are dropped) relative to
 * today, sorted by due date. Mirrors the hearing digest so a front-end can show overdue/today/soon.
 */
export function buildDeadlineDigest(
  deadlines: readonly Deadline[],
  options: DeadlineDigestOptions = {},
): DeadlineDigest {
  const today =
    parseHearingDate(options.today) ??
    currentDayIn(options.timeZone ?? DEFAULT_TIMEZONE, options.now ?? new Date());
  const horizonDays =
    options.horizonDays !== undefined &&
    Number.isFinite(options.horizonDays) &&
    options.horizonDays > 0
      ? Math.floor(options.horizonDays)
      : DEFAULT_HORIZON_DAYS;

  const entries: DeadlineEntry[] = [];
  for (const deadline of deadlines) {
    if (deadline.done) {
      continue;
    }
    const due = parseHearingDate(deadline.dueDate);
    if (!due) {
      continue;
    }
    const daysUntil = daysBetween(today, due);
    entries.push({ deadline, daysUntil, bucket: bucketFor(daysUntil, horizonDays) });
  }
  entries.sort((a, b) => a.daysUntil - b.daysUntil);

  const counts: Record<DeadlineBucket, number> = {
    overdue: 0,
    today: 0,
    tomorrow: 0,
    thisWeek: 0,
    later: 0,
  };
  for (const entry of entries) {
    counts[entry.bucket] += 1;
  }
  return { today, horizonDays, entries, counts };
}
