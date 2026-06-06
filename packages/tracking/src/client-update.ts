/**
 * A **client update** (docs/clients.md#client-updates): a client-facing summary of one client's
 * matters — the near-term hearings across their cases plus the recent alert-worthy changes — that
 * the advocate reviews and sends to the client. Built on the [hearing digest](./hearings.ts),
 * scoped to the client's cases and phrased for the client rather than the advocate.
 */
import type { Alert, Case, Client } from "@nowlez/contracts";
import { buildHearingDigest, type HearingDigestOptions, type HearingEntry } from "./hearings";

export interface ClientUpdate {
  readonly clientName: string;
  readonly date: string;
  /** Near-term hearings across the client's cases (overdue → this week). */
  readonly upcoming: readonly HearingEntry[];
  /** Recent (unread) alert-worthy changes on the client's cases. */
  readonly recentAlerts: readonly Alert[];
  /** True when there is nothing to tell the client. */
  readonly empty: boolean;
}

/** Compose a client update from the client, their cases, and the alert feed. */
export function buildClientUpdate(
  client: Client,
  cases: readonly Case[],
  alerts: readonly Alert[] = [],
  options: HearingDigestOptions = {},
): ClientUpdate {
  const digest = buildHearingDigest(cases, options);
  const upcoming = digest.entries.filter((e) => e.bucket !== "later" && e.bucket !== "unscheduled");
  const cnrs = new Set<string>(cases.map((c) => c.cnr));
  const recentAlerts = alerts.filter((a) => !a.read && cnrs.has(a.cnr));
  return {
    clientName: client.name,
    date: digest.today,
    upcoming,
    recentAlerts,
    empty: upcoming.length === 0 && recentAlerts.length === 0,
  };
}

/** Render the client update as a polite, client-facing message (e.g. to send over WhatsApp). */
export function formatClientUpdate(update: ClientUpdate): string {
  if (update.empty) {
    return `Dear ${update.clientName}, there are no upcoming hearings or new updates on your matter(s) as of ${update.date}.\n\n— sent via NowLez`;
  }
  const lines = [
    `Dear ${update.clientName}, here is an update on your matter(s) as of ${update.date}:`,
  ];
  if (update.upcoming.length > 0) {
    lines.push("", "Upcoming hearings:");
    for (const e of update.upcoming) {
      lines.push(`• ${e.date ?? "date to be confirmed"} — ${e.parties ?? e.cnr}`);
    }
  }
  if (update.recentAlerts.length > 0) {
    lines.push("", "Recent updates:");
    for (const a of update.recentAlerts) {
      lines.push(`• ${a.message}`);
    }
  }
  lines.push("", "— sent via NowLez");
  return lines.join("\n");
}
