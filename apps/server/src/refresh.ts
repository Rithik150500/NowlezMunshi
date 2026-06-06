import type { Alert } from "@nowlez/contracts";
import {
  buildDailyBriefing,
  buildHearingDigest,
  type DailyBriefing,
  type RefreshResult,
} from "@nowlez/tracking";
import type { ServerEngine } from "./engine";
import type { FirmServices } from "./firm-scope";
import { DEFAULT_NOTIFICATION_PREFERENCES, Notifier } from "./notifier";

export interface RefreshCycleResult {
  readonly results: readonly RefreshResult[];
  /** The alerts newly persisted by this cycle (deduped by the AlertStore). */
  readonly newAlerts: readonly Alert[];
  /** The daily briefing composed this cycle (pushed only when `dailyBriefing` is enabled). */
  readonly briefing: DailyBriefing;
}

/**
 * Refresh one **firm's** tracked cases, persist the alert-worthy changes, and route notifications
 * through the {@link Notifier} per the engine's preferences (ADR-0015): new alerts are pushed
 * best-effort, and — when enabled — a daily briefing of imminent hearings + unread alerts. Shared by
 * the `POST /refresh` route (the caller's firm) and the scheduler (fanned across every firm), so both
 * behave identically. The notification channel + preferences are firm-agnostic (on the engine).
 */
export async function runRefreshCycle(
  engine: ServerEngine,
  firm: FirmServices,
): Promise<RefreshCycleResult> {
  const results = await firm.tracking.refreshAll();
  const newAlerts = await firm.alerts.save(results.flatMap((r) => r.alerts));

  const notifier = new Notifier(
    engine.whatsApp,
    engine.alertRecipient,
    engine.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
  );
  await notifier.notifyAlerts(newAlerts);

  // Compose the briefing over the now-current caseload + alert feed; push it when enabled.
  const digest = buildHearingDigest(await firm.caseManagement.listCases());
  const briefing = buildDailyBriefing(digest, await firm.alerts.list());
  await notifier.notifyBriefing(briefing);

  return { results, newAlerts, briefing };
}
