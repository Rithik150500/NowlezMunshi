/**
 * @nowlez/tracking — the daily-refresh / alert engine (docs/alerts-and-tracking.md):
 * diff a re-fetched case against the stored snapshot and surface alert-worthy changes.
 */
export { type CaseChange, diffCase } from "./diff";
export {
  buildHearingDigest,
  type HearingBucket,
  type HearingDigest,
  type HearingDigestOptions,
  type HearingEntry,
  parseHearingDate,
} from "./hearings";
export { type RefreshResult, type TrackingOptions, TrackingService } from "./tracking";
