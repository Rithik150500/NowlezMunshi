import type { Alert } from "@nowlez/contracts";
import {
  buildDailyBriefing,
  buildHearingDigest,
  type DailyBriefing,
  type RefreshResult,
} from "@nowlez/tracking";
import type { ServerEngine } from "./engine";
import { DEFAULT_NOTIFICATION_PREFERENCES, Notifier } from "./notifier";

export interface RefreshCycleResult {
  readonly results: readonly RefreshResult[];
  /** The alerts newly persisted by this cycle (deduped by the AlertStore). */
  readonly newAlerts: readonly Alert[];
  /** The daily briefing composed this cycle (pushed only when `dailyBriefing` is enabled). */
  readonly briefing: DailyBriefing;
}

/**
 * Refresh every tracked case, persist the alert-worthy changes, and route notifications through the
 * {@link Notifier} per the engine's preferences (ADR-0015): new alerts are pushed best-effort, and
 * — when enabled — a daily briefing of imminent hearings + unread alerts. Shared by the
 * `POST /refresh` route and the scheduled daily cycle so both behave identically.
 */
export async function runRefreshCycle(engine: ServerEngine): Promise<RefreshCycleResult> {
  const results = await engine.tracking.refreshAll();
  const newAlerts = await engine.alerts.save(results.flatMap((r) => r.alerts));

  const notifier = new Notifier(
    engine.whatsApp,
    engine.alertRecipient,
    engine.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
  );
  await notifier.notifyAlerts(newAlerts);

  // Compose the briefing over the now-current caseload + alert feed; push it when enabled.
  const digest = buildHearingDigest(await engine.caseManagement.listCases());
  const briefing = buildDailyBriefing(digest, await engine.alerts.list());
  await notifier.notifyBriefing(briefing);

  return { results, newAlerts, briefing };
}
