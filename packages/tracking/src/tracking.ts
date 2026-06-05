import {
  type Alert,
  asAlertId,
  type Case,
  type CaseRepository,
  type Cnr,
  type CourtDataSource,
  type FetchedCase,
  type Order,
} from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { InMemoryCaseRepository } from "@nowlez/persistence";
import { type CaseChange, diffCase } from "./diff";

export interface RefreshResult {
  readonly cnr: Cnr;
  readonly changes: readonly CaseChange[];
  /** The alert-worthy changes, as Alerts ready to deliver. */
  readonly alerts: readonly Alert[];
  /** The case after the refresh (persisted). */
  readonly updated: Case;
}

export interface TrackingOptions {
  /** Clock for alert timestamps; injectable for deterministic tests. */
  now?: () => string;
}

/**
 * The daily-refresh / alert engine (docs/alerts-and-tracking.md). Re-fetches a
 * tracked case, diffs it against the stored snapshot, persists the latest, and
 * surfaces the alert-worthy changes as Alerts.
 *
 * Single-tenant for now: "fetch once, fan out to every user tracking it" and the
 * notification delivery channels await the auth/tenancy model
 * (open-questions.md). Scheduling the daily cycle is a deployment concern.
 */
export class TrackingService {
  private readonly now: () => string;

  constructor(
    private readonly courts: CourtDataSource = selectCourtDataSource(),
    private readonly repo: CaseRepository = new InMemoryCaseRepository(),
    options: TrackingOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Refresh one tracked case: fetch the latest, diff, persist, and surface alerts. */
  async refresh(cnr: Cnr): Promise<RefreshResult> {
    const previous = await this.repo.get(cnr);
    if (!previous) {
      throw new Error(`TrackingService: case ${cnr} has not been added.`);
    }
    const latest = mergeFetched(previous, await this.courts.getCaseByCnr(cnr));
    const changes = diffCase(previous, latest);
    await this.repo.save(latest);
    const alerts = changes.filter((c) => c.alertWorthy).map((c) => this.toAlert(c));
    return { cnr, changes, alerts, updated: latest };
  }

  /** Refresh every tracked case — the daily cycle. */
  async refreshAll(): Promise<readonly RefreshResult[]> {
    const results: RefreshResult[] = [];
    for (const c of (await this.repo.list()).filter((value) => value.tracking)) {
      results.push(await this.refresh(c.cnr));
    }
    return results;
  }

  private toAlert(change: CaseChange): Alert {
    const seed = change.orderId
      ? `${change.cnr}:new-order:${change.orderId}`
      : `${change.cnr}:case-update`;
    return {
      id: asAlertId(seed),
      cnr: change.cnr,
      kind: change.kind,
      message: change.summary,
      createdAt: this.now(),
      read: false,
    };
  }
}

/**
 * Merge a freshly-fetched case over the stored one: take eCourts as the source
 * of truth for details, keep already-ingested orders, append new raw orders, and
 * preserve the local tracking flag.
 */
function mergeFetched(previous: Case, fetched: FetchedCase): Case {
  const known = new Set<string>(previous.orders.map((o) => o.id));
  const orders: Order[] = [...previous.orders];
  for (const fo of fetched.orders) {
    if (!known.has(fo.id)) {
      orders.push({
        id: fo.id,
        cnr: fetched.cnr,
        sourcePdf: fo.pdf,
        // Filled later by ingestion (Phase 3).
        pageImages: [],
        summary: "",
      });
    }
  }
  return {
    cnr: fetched.cnr,
    court: fetched.court,
    details: fetched.details,
    tracking: previous.tracking,
    orders,
    files: previous.files,
  };
}
