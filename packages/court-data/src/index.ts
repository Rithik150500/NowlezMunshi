/**
 * @nowlez/court-data — implementations of the source-agnostic CourtDataSource
 * interface (ADR-0002) plus the single source selector. The mock is the only
 * implementation in Phase 1; real eCourts sources arrive in Phase 6.
 */
export { SAMPLE_CNR, sampleFetchedCase } from "./fixtures";
export { MockCourtDataSource } from "./mock-source";
export { selectCourtDataSource } from "./select-source";
