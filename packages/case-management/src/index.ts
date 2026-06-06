import type {
  Case,
  CaseMiniDetail,
  CaseNumberSearchQuery,
  CaseRepository,
  CaseSearchResult,
  CauseListEntry,
  Cnr,
  CourtDataSource,
  CourtHierarchy,
  CourtScope,
  FetchedCase,
  PartySearchQuery,
} from "@nowlez/contracts";
import { toMiniDetail } from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { InMemoryCaseRepository } from "@nowlez/persistence";

/**
 * Case Management — how a case enters NowLez and stays current
 * (docs/case-management.md). Court data flows through an injected
 * CourtDataSource (ADR-0002); cases are persisted through a CaseRepository
 * (ADR-0007), in-memory by default.
 *
 * Phase 2: add-case-by-CNR/QR, the two search paths, and the cause-list
 * cross-reference are implemented against the (mock) source.
 */
export class CaseManagement {
  constructor(
    private readonly courts: CourtDataSource = selectCourtDataSource(),
    private readonly repo: CaseRepository = new InMemoryCaseRepository(),
  ) {}

  /** Which court-data source is backing this instance. */
  get sourceId() {
    return this.courts.id;
  }

  /** Add a case by CNR: fetch it through the source and persist it (tracked). */
  async addCaseByCnr(cnr: Cnr): Promise<Case> {
    return this.record(await this.courts.getCaseByCnr(cnr));
  }

  /** Add a case by QR scan: pulls full details + order PDFs, then persists it. */
  async addCaseByQr(qrPayload: string): Promise<Case> {
    return this.record(await this.courts.getCaseByQr(qrPayload));
  }

  /** A previously-added case, if present. */
  async getCase(cnr: Cnr): Promise<Case | undefined> {
    return this.repo.get(cnr);
  }

  /** All added cases. */
  async listCases(): Promise<readonly Case[]> {
    return this.repo.list();
  }

  /**
   * The compact mini-details across all added cases — the case-aware context the
   * Munshi reasons over (docs/munshi.md#context-assembly).
   */
  async listMiniDetails(): Promise<readonly CaseMiniDetail[]> {
    return (await this.listCases()).map(toMiniDetail);
  }

  /** Turn tracking on or off for an added case. */
  async setTracking(cnr: Cnr, tracking: boolean): Promise<void> {
    const existing = await this.repo.get(cnr);
    if (!existing) {
      throw new Error(`CaseManagement: case ${cnr} has not been added.`);
    }
    await this.repo.save({ ...existing, tracking });
  }

  /** Search eCourts by party name, scoped through the court hierarchy. */
  async searchByParty(query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    return this.courts.searchByParty(query);
  }

  /** Search eCourts by case number (type + number + year), scoped through the hierarchy. */
  async searchByCaseNumber(query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    return this.courts.searchByCaseNumber(query);
  }

  /**
   * The court's daily cause list for `date`, cross-referenced against the user's
   * tracked cases: only the listings that concern those cases are returned.
   */
  async getCauseListForUser(date: string): Promise<readonly CauseListEntry[]> {
    const tracked = (await this.repo.list()).filter((c) => c.tracking);
    if (tracked.length === 0) {
      return [];
    }
    const trackedCnrs = new Set<string>(tracked.map((c) => c.cnr));
    const concerning = new Map<string, CauseListEntry>();
    for (const scope of dedupeScopes(tracked.map((c) => c.court))) {
      for (const entry of await this.courts.getCauseList({ scope, date })) {
        if (entry.cnr !== undefined && trackedCnrs.has(entry.cnr) && !concerning.has(entry.cnr)) {
          concerning.set(entry.cnr, entry);
        }
      }
    }
    return [...concerning.values()];
  }

  /** Map a freshly-fetched case into the domain model and persist it (tracked). */
  private async record(fetched: FetchedCase): Promise<Case> {
    const value: Case = {
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
    await this.repo.save(value);
    return value;
  }
}

/** Collapse a set of located court hierarchies into distinct search scopes. */
function dedupeScopes(courts: readonly CourtHierarchy[]): CourtScope[] {
  const seen = new Map<string, CourtScope>();
  for (const c of courts) {
    const key = `${c.stateOrHighCourt}|${c.districtOrBench}|${c.court}`;
    if (!seen.has(key)) {
      seen.set(key, {
        stateOrHighCourt: c.stateOrHighCourt,
        districtOrBench: c.districtOrBench,
        court: c.court,
      });
    }
  }
  return [...seen.values()];
}
