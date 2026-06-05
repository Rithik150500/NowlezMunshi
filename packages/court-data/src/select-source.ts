import { type CourtDataSource, NotImplementedError, type SourceId } from "@nowlez/contracts";
import { MockCourtDataSource } from "./mock-source";

/**
 * The single source selector (ADR-0002). Everything in NowLez obtains its
 * CourtDataSource here; switching the backing source is changing the `id`
 * argument and nothing else. Only the mock is implemented in Phase 1 — the real
 * eCourts sources (mobile / web / commercial) arrive in Phase 6.
 *
 * @see ../../../docs/decisions/0002-source-agnostic-court-data-interface.md
 */
export function selectCourtDataSource(id: SourceId = "mock"): CourtDataSource {
  switch (id) {
    case "mock":
      return new MockCourtDataSource();
    case "ecourts-mobile":
    case "ecourts-web":
    case "commercial":
      throw new NotImplementedError(`CourtDataSource "${id}"`, "Phase 6");
    default:
      return assertNever(id);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled source id: ${String(x)}`);
}
