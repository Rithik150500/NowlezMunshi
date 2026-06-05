import {
  type Case,
  type CaseNumberSearchQuery,
  type CaseSearchResult,
  type CauseListEntry,
  type Cnr,
  type CourtDataSource,
  type FetchedCase,
  NotImplementedError,
  type PartySearchQuery,
} from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";

/**
 * Case Management — how a case enters NowLez and stays current
 * (docs/case-management.md). Every feature is powered by an injected
 * CourtDataSource (ADR-0002).
 *
 * Phase 2: **add-case-by-CNR** is implemented end to end against the (mock)
 * source, with an in-memory store. Persistence is deferred
 * (open-questions.md#data-model), so the store is intentionally in-memory and
 * swappable; the search paths and the cause-list cross-reference land later.
 */
export class CaseManagement {
  private readonly store = new Map<Cnr, Case>();

  constructor(private readonly courts: CourtDataSource = selectCourtDataSource()) {}

  /** Which court-data source is backing this instance. */
  get sourceId() {
    return this.courts.id;
  }

  /** Add a case by CNR: fetch it through the source and record it (tracked). */
  async addCaseByCnr(cnr: Cnr): Promise<Case> {
    return this.add(await this.courts.getCaseByCnr(cnr));
  }

  /** Add a case by QR scan: pulls full details + order PDFs, then records it. */
  async addCaseByQr(qrPayload: string): Promise<Case> {
    return this.add(await this.courts.getCaseByQr(qrPayload));
  }

  /** A previously-added case, if present. */
  getCase(cnr: Cnr): Case | undefined {
    return this.store.get(cnr);
  }

  /** All added cases. */
  listCases(): readonly Case[] {
    return [...this.store.values()];
  }

  /** Turn tracking on or off for an added case. */
  async setTracking(cnr: Cnr, tracking: boolean): Promise<void> {
    const existing = this.store.get(cnr);
    if (!existing) {
      throw new Error(`CaseManagement: case ${cnr} has not been added.`);
    }
    this.store.set(cnr, { ...existing, tracking });
  }

  searchByParty(_query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("CaseManagement.searchByParty", "Phase 2");
  }

  searchByCaseNumber(_query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("CaseManagement.searchByCaseNumber", "Phase 2");
  }

  /** The court's daily cause list, cross-referenced against the user's tracked cases. */
  getCauseListForUser(_date: string): Promise<readonly CauseListEntry[]> {
    throw new NotImplementedError("CaseManagement.getCauseListForUser", "Phase 6");
  }

  /** Map a freshly-fetched case into the domain model and store it. */
  private add(fetched: FetchedCase): Case {
    const next: Case = {
      cnr: fetched.cnr,
      court: fetched.court,
      details: fetched.details,
      // A newly-added case is tracked (docs/case-management.md#tracking).
      tracking: true,
      orders: fetched.orders.map((o) => ({
        id: o.id,
        cnr: fetched.cnr,
        sourcePdf: o.pdf,
        // Page images and the order summary are produced later, by ingestion (Phase 3).
        pageImages: [],
        summary: "",
      })),
      files: [],
    };
    this.store.set(next.cnr, next);
    return next;
  }
}
