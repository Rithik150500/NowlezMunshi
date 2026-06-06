import { CaseManagement } from "@nowlez/case-management";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { IngestionPipeline } from "@nowlez/file-management";
import { FakeModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
import { InMemoryAlertStore, InMemoryCaseRepository } from "@nowlez/persistence";
import { InMemoryBlobStore } from "@nowlez/storage";
import { TrackingService } from "@nowlez/tracking";
import { FakeWhatsAppClient } from "@nowlez/whatsapp";
import { describe, expect, it } from "vitest";
import type { ServerEngine } from "./engine";
import { runRefreshCycle } from "./refresh";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

async function staleEngine(
  recipient = "",
): Promise<{ engine: ServerEngine; whatsApp: FakeWhatsAppClient }> {
  const courts = new MockCourtDataSource();
  const repo = new InMemoryCaseRepository();
  const whatsApp = new FakeWhatsAppClient();
  // Stale snapshot (no orders): the mock source reports one order -> a new-order alert.
  await repo.save({
    cnr: SAMPLE_CNR,
    court: COURT,
    details: { status: "Disposed" },
    tracking: true,
    orders: [],
    files: [],
  });
  const engine: ServerEngine = {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
    munshi: new Munshi(new FakeModelClient(() => ({ text: "{}" }))),
    handlers: {},
    ingestion: new IngestionPipeline(),
    blobs: new InMemoryBlobStore(),
    alerts: new InMemoryAlertStore(),
    whatsApp,
    whatsAppVerifyToken: "secret",
    alertRecipient: recipient,
  };
  return { engine, whatsApp };
}

describe("runRefreshCycle", () => {
  it("persists new alerts and pushes them when a recipient is set; idempotent thereafter", async () => {
    const { engine, whatsApp } = await staleEngine("15551234567");

    const cycle = await runRefreshCycle(engine);
    expect(cycle.newAlerts).toHaveLength(1);
    expect(await engine.alerts.list()).toHaveLength(1);
    expect(whatsApp.sent[0]?.to).toBe("15551234567");

    // A second cycle finds no further changes — no new alerts, no extra push.
    const second = await runRefreshCycle(engine);
    expect(second.newAlerts).toHaveLength(0);
    expect(whatsApp.sent).toHaveLength(1);
  });

  it("persists but does not push when no recipient is configured", async () => {
    const { engine, whatsApp } = await staleEngine();
    const cycle = await runRefreshCycle(engine);
    expect(cycle.newAlerts).toHaveLength(1);
    expect(whatsApp.sent).toHaveLength(0);
  });
});
