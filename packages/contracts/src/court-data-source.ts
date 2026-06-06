/**
 * The single, source-agnostic seam through which ALL court data enters NowLez
 * (ADR-0002). Concrete sources — the eCourts mobile-app backend, a web-portal
 * scrape, a commercial API, or the dev MockCourtDataSource — implement it; the
 * Munshi, ingestion, and the alert engine never know which one is in use.
 *
 * PROVISIONAL: exact method signatures and request/response shapes are an open
 * question (open-questions.md#ecourts-integration). This encodes the operations
 * the spec implies for Case Management (add / search / cause-list); refine when
 * a real source is implemented in Phase 6.
 *
 * @see ../../../docs/ecourts-integration.md
 * @see ../../../docs/decisions/0002-source-agnostic-court-data-interface.md
 */
import { z } from "zod";
import type { BinaryRef } from "./binary";
import type { Cnr, OrderId } from "./brands";
import type { CaseDetails, CourtHierarchy } from "./data-model";

/**
 * Identifies which implementation backs the CourtDataSource. The single source
 * selector (ADR-0002) maps one of these to a concrete implementation; switching
 * sources is changing this value and nothing else.
 */
export type SourceId = "mock" | "ecourts-mobile" | "ecourts-web" | "commercial";

/**
 * A progressively-narrowed court selection used to SCOPE a search:
 * State/HC -> District/Bench -> Court. Only the levels chosen so far are
 * present. (A located case carries the fully-resolved CourtHierarchy instead.)
 */
export interface CourtScope {
  readonly stateOrHighCourt: string;
  readonly districtOrBench?: string;
  readonly court?: string;
}

export interface PartySearchQuery {
  readonly scope: CourtScope;
  readonly partyName: string;
  readonly year: number;
}

export interface CaseNumberSearchQuery {
  readonly scope: CourtScope;
  readonly caseType: string;
  readonly caseNumber: string;
  readonly year: number;
}

/** A lightweight search hit; resolve to a full case via getCaseByCnr. */
export interface CaseSearchResult {
  readonly cnr: Cnr;
  readonly parties: string;
  readonly court: CourtHierarchy;
  readonly caseType?: string;
  readonly caseNumber?: string;
  readonly year?: number;
}

export interface FetchedOrder {
  readonly id: OrderId;
  readonly pdf: BinaryRef;
  /** ISO 8601 date, when known. */
  readonly date?: string;
}

/**
 * The full record a source returns for a case: its details plus the order PDFs.
 * The ingestion pipeline derives page images and summaries from these downstream.
 */
export interface FetchedCase {
  readonly cnr: Cnr;
  readonly court: CourtHierarchy;
  readonly details: CaseDetails;
  readonly orders: readonly FetchedOrder[];
}

export interface CauseListQuery {
  readonly scope: CourtScope;
  /** ISO 8601 date — the day cases are to be heard. */
  readonly date: string;
}

/**
 * One listing on a court's daily cause list. Cross-referencing the whole list
 * against a user's own cases happens ABOVE this interface, in Case Management.
 */
export interface CauseListEntry {
  readonly court: CourtHierarchy;
  readonly date: string;
  readonly cnr?: Cnr;
  readonly caseNumber?: string;
  readonly parties?: string;
  readonly item?: string;
  readonly purpose?: string;
}

/**
 * The source-agnostic court-data interface. Operational discipline —
 * rate-limiting, caching, and fetch-once/fan-out (alerts-and-tracking.md) —
 * lives at this seam, not in callers.
 */
export interface CourtDataSource {
  /** Which implementation this is. */
  readonly id: SourceId;
  /** Add a case by CNR: its details and its order PDFs. */
  getCaseByCnr(cnr: Cnr): Promise<FetchedCase>;
  /** Add a case by QR scan: pulls full case details and the order PDFs. */
  getCaseByQr(qrPayload: string): Promise<FetchedCase>;
  /** The order PDFs for a case (used by tracking when new orders appear). */
  getOrders(cnr: Cnr): Promise<readonly FetchedOrder[]>;
  /** Search by party name, scoped through the court hierarchy. */
  searchByParty(query: PartySearchQuery): Promise<readonly CaseSearchResult[]>;
  /** Search by case number (type + number + year), scoped through the hierarchy. */
  searchByCaseNumber(query: CaseNumberSearchQuery): Promise<readonly CaseSearchResult[]>;
  /** The court's published daily cause list for a given day. */
  getCauseList(query: CauseListQuery): Promise<readonly CauseListEntry[]>;
}

// --- Runtime validation for inputs crossing the seam (the trust boundary). ---

export const CourtScopeSchema = z.object({
  stateOrHighCourt: z.string().min(1),
  districtOrBench: z.string().min(1).optional(),
  court: z.string().min(1).optional(),
});

export const PartySearchQuerySchema = z.object({
  scope: CourtScopeSchema,
  partyName: z.string().min(1),
  year: z.number().int(),
});

export const CaseNumberSearchQuerySchema = z.object({
  scope: CourtScopeSchema,
  caseType: z.string().min(1),
  caseNumber: z.string().min(1),
  year: z.number().int(),
});

export const CauseListQuerySchema = z.object({
  scope: CourtScopeSchema,
  date: z.string().min(1),
});
