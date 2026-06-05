import {
  type Case,
  type CaseNumberSearchQuery,
  type CaseSearchResult,
  type CauseListEntry,
  type Cnr,
  type CourtDataSource,
  NotImplementedError,
  type PartySearchQuery,
} from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";

/**
 * Case Management (stub) — how a case enters NowLez and stays current
 * (docs/case-management.md). Every feature is powered by an injected
 * CourtDataSource (ADR-0002); behaviour lands from Phase 2 onward.
 */
export class CaseManagement {
  constructor(private readonly courts: CourtDataSource = selectCourtDataSource()) {}

  /** Which court-data source is backing this instance. */
  get sourceId() {
    return this.courts.id;
  }

  addCaseByCnr(_cnr: Cnr): Promise<Case> {
    throw new NotImplementedError("CaseManagement.addCaseByCnr", "Phase 2");
  }

  addCaseByQr(_qrPayload: string): Promise<Case> {
    throw new NotImplementedError("CaseManagement.addCaseByQr", "Phase 2");
  }

  searchByParty(_query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("CaseManagement.searchByParty", "Phase 2");
  }

  searchByCaseNumber(_query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    throw new NotImplementedError("CaseManagement.searchByCaseNumber", "Phase 2");
  }

  setTracking(_cnr: Cnr, _tracking: boolean): Promise<void> {
    throw new NotImplementedError("CaseManagement.setTracking", "Phase 2");
  }

  /** The court's daily cause list, cross-referenced against the user's tracked cases. */
  getCauseListForUser(_date: string): Promise<readonly CauseListEntry[]> {
    throw new NotImplementedError("CaseManagement.getCauseListForUser", "Phase 6");
  }
}
