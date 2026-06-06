/**
 * "Never miss a hearing" (docs/alerts-and-tracking.md#never-miss-a-hearing). A read over the
 * stored caseload that places each tracked, still-active case on a timeline relative to "today",
 * so the upcoming (and overdue) hearings surface without polling eCourts. This is the standing
 * companion to the change-driven alerts in `diff.ts`: alerts fire when a hearing date *changes*;
 * the digest answers "what is coming up, and did anything slip past?".
 */
import { type Case, type Cnr, type CourtHierarchy, caseLifecycle } from "@nowlez/contracts";

/** Where a case's next hearing falls relative to "today". */
export type HearingBucket = "overdue" | "today" | "tomorrow" | "thisWeek" | "later" | "unscheduled";

/** One tracked, active case placed on the hearing timeline. */
export interface HearingEntry {
  readonly cnr: Cnr;
  readonly court: CourtHierarchy;
  readonly parties?: string;
  readonly caseNumber?: string;
  /** The next hearing date as stored (the raw eCourts string). */
  readonly nextHearingDate?: string;
  /** Normalised YYYY-MM-DD, when the raw value parses; absent otherwise. */
  readonly date?: string;
  /** Whole days from today (negative = overdue); absent when unscheduled. */
  readonly daysUntil?: number;
  readonly bucket: HearingBucket;
}

export interface HearingDigest {
  /** The reference day (YYYY-MM-DD) the digest was computed against. */
  readonly today: string;
  /** The upcoming window, in days, treated as "this week". */
  readonly horizonDays: number;
  /** Entries sorted by date ascending (overdue first); unscheduled last, then by CNR. */
  readonly entries: readonly HearingEntry[];
  /** How many entries fell into each bucket. */
  readonly counts: Readonly<Record<HearingBucket, number>>;
}

export interface HearingDigestOptions {
  /** Reference day; an ISO date or timestamp. Defaults to the current day (UTC). */
  readonly today?: string;
  /** The window treated as "this week". Defaults to 7 days. */
  readonly horizonDays?: number;
}

const DEFAULT_HORIZON_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * Parse a stored hearing date into a normalised YYYY-MM-DD, tolerating the formats eCourts emits:
 * ISO (`2026-06-20`, optionally with a time suffix) and `DD-MM-YYYY` / `DD/MM/YYYY`. Returns
 * `undefined` for anything else (an unparseable value becomes an "unscheduled" entry, never a
 * silently-dropped case).
 */
export function parseHearingDate(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) {
    return isoIfValid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(trimmed);
  if (dmy) {
    return isoIfValid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }
  return undefined;
}

/** Format Y/M/D as YYYY-MM-DD, rejecting impossible dates (e.g. 31 Feb). */
function isoIfValid(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const pad4 = (n: number): string => String(n).padStart(4, "0");

/** The reference day: a parsed `today`, else the current UTC day. */
function referenceDay(today: string | undefined): string {
  return parseHearingDate(today) ?? new Date().toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD days (UTC midnight), exact (no DST in UTC). */
function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / MS_PER_DAY,
  );
}

function bucketFor(daysUntil: number, horizonDays: number): HearingBucket {
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

/** Stable string comparison (no nested ternary, no locale dependence). */
function cmp(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Scheduled before unscheduled; among scheduled, by date ascending; tie-break by CNR. */
function compareEntries(a: HearingEntry, b: HearingEntry): number {
  if (a.date && b.date) {
    return a.date === b.date ? cmp(a.cnr, b.cnr) : cmp(a.date, b.date);
  }
  if (a.date) {
    return -1;
  }
  if (b.date) {
    return 1;
  }
  return cmp(a.cnr, b.cnr);
}

function emptyCounts(): Record<HearingBucket, number> {
  return { overdue: 0, today: 0, tomorrow: 0, thisWeek: 0, later: 0, unscheduled: 0 };
}

/**
 * Build the hearing digest over a caseload. Only **tracked, still-active** cases are included — a
 * disposed matter has no live hearing, and an untracked case is not kept current (this mirrors
 * `refreshAll`). The result is sorted and bucketed so a front-end can show "overdue / today /
 * tomorrow / this week / later" at a glance.
 */
export function buildHearingDigest(
  cases: readonly Case[],
  options: HearingDigestOptions = {},
): HearingDigest {
  const today = referenceDay(options.today);
  const horizonDays =
    options.horizonDays !== undefined &&
    Number.isFinite(options.horizonDays) &&
    options.horizonDays > 0
      ? Math.floor(options.horizonDays)
      : DEFAULT_HORIZON_DAYS;

  const entries: HearingEntry[] = [];
  for (const value of cases) {
    if (!value.tracking || caseLifecycle(value) !== "active") {
      continue;
    }
    const raw = value.details.nextHearingDate;
    const date = parseHearingDate(raw);
    const base = {
      cnr: value.cnr,
      court: value.court,
      parties: value.details.parties,
      caseNumber: value.details.caseNumber,
      nextHearingDate: raw,
    };
    if (date) {
      const daysUntil = daysBetween(today, date);
      entries.push({ ...base, date, daysUntil, bucket: bucketFor(daysUntil, horizonDays) });
    } else {
      entries.push({ ...base, bucket: "unscheduled" });
    }
  }

  entries.sort(compareEntries);

  const counts = emptyCounts();
  for (const entry of entries) {
    counts[entry.bucket] += 1;
  }

  return { today, horizonDays, entries, counts };
}
