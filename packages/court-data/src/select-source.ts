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

/** The valid `NOWLEZ_COURT_SOURCE` values (the SourceId union). */
export const COURT_SOURCE_IDS: readonly SourceId[] = [
  "mock",
  "ecourts-mobile",
  "ecourts-web",
  "commercial",
];

/**
 * Select the source from `NOWLEZ_COURT_SOURCE` (default `mock`), so an operator can flip to a
 * real eCourts source by config once it's implemented. An unknown value fails fast; a valid but
 * not-yet-built source throws NotImplementedError — the seam is ready ahead of the adapter.
 */
export function selectCourtDataSourceFromEnv(
  value: string | undefined = process.env.NOWLEZ_COURT_SOURCE,
): CourtDataSource {
  if (!value) {
    return selectCourtDataSource("mock");
  }
  if (!COURT_SOURCE_IDS.includes(value as SourceId)) {
    throw new Error(`NOWLEZ_COURT_SOURCE must be one of: ${COURT_SOURCE_IDS.join(", ")}`);
  }
  return selectCourtDataSource(value as SourceId);
}

function assertNever(x: never): never {
  throw new Error(`Unhandled source id: ${String(x)}`);
}
