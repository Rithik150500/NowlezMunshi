import type { Alert } from "@nowlez/contracts";
import type { RefreshResult } from "@nowlez/tracking";
import type { ServerEngine } from "./engine";

export interface RefreshCycleResult {
  readonly results: readonly RefreshResult[];
  /** The alerts newly persisted by this cycle (deduped by the AlertStore). */
  readonly newAlerts: readonly Alert[];
}

/**
 * Refresh every tracked case, persist the alert-worthy changes, and best-effort push the
 * new alerts to the configured WhatsApp number. Shared by the `POST /refresh` route and the
 * scheduled daily cycle (ADR-0015) so both behave identically.
 */
export async function runRefreshCycle(engine: ServerEngine): Promise<RefreshCycleResult> {
  const results = await engine.tracking.refreshAll();
  const newAlerts = await engine.alerts.save(results.flatMap((r) => r.alerts));
  if (newAlerts.length > 0 && engine.alertRecipient) {
    const summary = newAlerts.map((a) => `• [${a.kind}] ${a.cnr}: ${a.message}`).join("\n");
    await engine.whatsApp.sendMessage(engine.alertRecipient, `NowLez alerts:\n${summary}`);
  }
  return { results, newAlerts };
}
