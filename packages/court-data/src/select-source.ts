import { type CourtDataSource, NotImplementedError, type SourceId } from "@nowlez/contracts";
import { throttledCachingSource } from "./caching-source";
import { EcourtsMobileSource } from "./ecourts-mobile-source";
import { MockCourtDataSource } from "./mock-source";

/**
 * The single source selector (ADR-0002). Everything in NowLez obtains its
 * CourtDataSource here; switching the backing source is changing the `id`
 * argument and nothing else. The mock (dev) and the eCourts mobile-app source
 * (ADR-0016, provisional) are implemented; the web-portal and commercial
 * sources arrive later.
 *
 * @see ../../../docs/decisions/0002-source-agnostic-court-data-interface.md
 */
export function selectCourtDataSource(id: SourceId = "mock"): CourtDataSource {
  switch (id) {
    case "mock":
      return new MockCourtDataSource();
    case "ecourts-mobile":
      return new EcourtsMobileSource();
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

function baseSourceForEnv(value: string | undefined): CourtDataSource {
  if (!value) {
    return selectCourtDataSource("mock");
  }
  if (!COURT_SOURCE_IDS.includes(value as SourceId)) {
    throw new Error(`NOWLEZ_COURT_SOURCE must be one of: ${COURT_SOURCE_IDS.join(", ")}`);
  }
  return selectCourtDataSource(value as SourceId);
}

/**
 * Select the source from `NOWLEZ_COURT_SOURCE` (default `mock`) and apply operational discipline
 * from the environment: a TTL cache (`NOWLEZ_COURT_CACHE_TTL_MS`, the fetch-once/fan-out window —
 * keep it well below the daily refresh) and a rate limit (`NOWLEZ_COURT_MIN_INTERVAL_MS`). Both
 * default off, so the selector is otherwise unchanged. An unknown source fails fast; a valid but
 * not-yet-built source throws NotImplementedError — the seam is ready ahead of the adapter.
 */
export function selectCourtDataSourceFromEnv(
  value: string | undefined = process.env.NOWLEZ_COURT_SOURCE,
): CourtDataSource {
  return throttledCachingSource(baseSourceForEnv(value), {
    ttlMs: Number(process.env.NOWLEZ_COURT_CACHE_TTL_MS ?? 0),
    minIntervalMs: Number(process.env.NOWLEZ_COURT_MIN_INTERVAL_MS ?? 0),
  });
}

function assertNever(x: never): never {
  throw new Error(`Unhandled source id: ${String(x)}`);
}
