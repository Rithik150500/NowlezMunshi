/**
 * @nowlez/court-data — implementations of the source-agnostic CourtDataSource
 * interface (ADR-0002) plus the single source selector: the dev `MockCourtDataSource`
 * and a provisional `EcourtsMobileSource` (the mobile-app path, ADR-0004 / ADR-0016).
 * The web-portal and commercial sources remain selectable stubs.
 */

export {
  CachingCourtDataSource,
  type Clock,
  RateLimitedCourtDataSource,
  throttledCachingSource,
} from "./caching-source";
export {
  createEcourtsCodec,
  ECOURTS_IV_PREFIX_TABLE,
  ECOURTS_REQUEST_KEY_HEX,
  ECOURTS_RESPONSE_KEY_HEX,
  type EcourtsCodec,
  type EcourtsCodecOptions,
  identityEcourtsCodec,
} from "./ecourts-codec";
export {
  ECOURTS_DEFAULT_BASE_URL,
  type EcourtsMobileConfig,
  EcourtsMobileSource,
  type EcourtsTransport,
} from "./ecourts-mobile-source";
export { SAMPLE_CNR, sampleFetchedCase } from "./fixtures";
export { MockCourtDataSource } from "./mock-source";
export {
  COURT_SOURCE_IDS,
  selectCourtDataSource,
  selectCourtDataSourceFromEnv,
} from "./select-source";
