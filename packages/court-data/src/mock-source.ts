import type {
  CaseNumberSearchQuery,
  CaseSearchResult,
  CauseListEntry,
  CauseListQuery,
  Cnr,
  CourtDataSource,
  FetchedCase,
  FetchedOrder,
  PartySearchQuery,
  SourceId,
} from "@nowlez/contracts";
import { sampleFetchedCase } from "./fixtures";

/**
 * A deterministic, network-free CourtDataSource for development and tests
 * (ADR-0002). It lets the Phase-2 slice (add-case-by-CNR, end to end) and the
 * whole test suite run with NO real eCourts calls. Real sources arrive in
 * Phase 6 behind the same interface.
 */
export class MockCourtDataSource implements CourtDataSource {
  readonly id: SourceId = "mock";

  private readonly cases: ReadonlyMap<string, FetchedCase>;

  constructor(seed: readonly FetchedCase[] = [sampleFetchedCase]) {
    this.cases = new Map(seed.map((c) => [c.cnr, c]));
  }

  async getCaseByCnr(cnr: Cnr): Promise<FetchedCase> {
    const found = this.cases.get(cnr);
    if (!found) {
      throw new Error(`MockCourtDataSource: no case for CNR ${cnr}`);
    }
    return found;
  }

  async getCaseByQr(qrPayload: string): Promise<FetchedCase> {
    // The QR encodes a CNR; the mock treats the payload as the CNR directly.
    return this.getCaseByCnr(qrPayload as Cnr);
  }

  async getOrders(cnr: Cnr): Promise<readonly FetchedOrder[]> {
    return (await this.getCaseByCnr(cnr)).orders;
  }

  async searchByParty(query: PartySearchQuery): Promise<readonly CaseSearchResult[]> {
    const needle = query.partyName.toLowerCase();
    return this.toResults((c) => (c.details.parties ?? "").toLowerCase().includes(needle));
  }

  async searchByCaseNumber(query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]> {
    return this.toResults(
      (c) => c.details.caseNumber === query.caseNumber && c.details.year === query.year,
    );
  }

  async getCauseList(query: CauseListQuery): Promise<readonly CauseListEntry[]> {
    return [...this.cases.values()].map((c) => ({
      court: c.court,
      date: query.date,
      cnr: c.cnr,
      caseNumber: c.details.caseNumber,
      parties: c.details.parties,
    }));
  }

  private toResults(predicate: (c: FetchedCase) => boolean): CaseSearchResult[] {
    return [...this.cases.values()].filter(predicate).map((c) => ({
      cnr: c.cnr,
      parties: c.details.parties ?? "",
      court: c.court,
      caseType: c.details.caseType,
      caseNumber: c.details.caseNumber,
      year: c.details.year,
    }));
  }
}
