import { AuthService, FakeGoogleVerifier, FakeOtpSender } from "@nowlez/auth";
import { MockCourtDataSource, SAMPLE_CNR, sampleFetchedCase } from "@nowlez/court-data";
import { IngestionPipeline } from "@nowlez/file-management";
import { FakeModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
import {
  InMemoryAlertStore,
  InMemoryCaseRepository,
  InMemoryClientRepository,
  InMemoryDeadlineStore,
  InMemoryFirmRepository,
  InMemorySessionStore,
  InMemoryUserRepository,
} from "@nowlez/persistence";
import { InMemoryBlobStore } from "@nowlez/storage";
import { FakeWhatsAppClient } from "@nowlez/whatsapp";
import { describe, expect, it } from "vitest";
import type { ServerEngine } from "./engine";
import { makeFirmScope } from "./firm-scope";
import { runRefreshCycle } from "./refresh";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

async function staleEngine(
  recipient = "",
): Promise<{ engine: ServerEngine; whatsApp: FakeWhatsAppClient }> {
  const courts = new MockCourtDataSource();
  const repo = new InMemoryCaseRepository();
  const blobs = new InMemoryBlobStore();
  const whatsApp = new FakeWhatsAppClient();
  // Stale snapshot: active case matching the source's details but missing the order, so the only
  // change on refresh is the new order (one alert).
  await repo.save({
    cnr: SAMPLE_CNR,
    court: COURT,
    details: { ...sampleFetchedCase.details },
    tracking: true,
    orders: [],
    files: [],
  });
  const engine: ServerEngine = {
    auth: new AuthService({
      users: new InMemoryUserRepository(),
      firms: new InMemoryFirmRepository(),
      sessions: new InMemorySessionStore(),
      otp: new FakeOtpSender(),
      google: new FakeGoogleVerifier(),
    }),
    forFirm: makeFirmScope({
      courts,
      blobs,
      caseRepo: () => repo,
      clientRepo: () => new InMemoryClientRepository(),
      deadlineStore: () => new InMemoryDeadlineStore(),
      alertStore: () => new InMemoryAlertStore(),
    }),
    firms: new InMemoryFirmRepository(),
    users: new InMemoryUserRepository(),
    munshi: new Munshi(new FakeModelClient(() => ({ text: "{}" }))),
    ingestion: new IngestionPipeline(),
    blobs,
    docxReader: { extractText: async () => "" },
    whatsApp,
    whatsAppVerifyToken: "secret",
    alertRecipient: recipient,
  };
  return { engine, whatsApp };
}

describe("runRefreshCycle", () => {
  it("persists new alerts and pushes them when a recipient is set; idempotent thereafter", async () => {
    const { engine, whatsApp } = await staleEngine("15551234567");
    const firm = engine.forFirm("default");

    const cycle = await runRefreshCycle(engine, firm);
    expect(cycle.newAlerts).toHaveLength(1);
    expect(await firm.alerts.list()).toHaveLength(1);
    expect(whatsApp.sent[0]?.to).toBe("15551234567");

    // A second cycle finds no further changes — no new alerts, no extra push.
    const second = await runRefreshCycle(engine, firm);
    expect(second.newAlerts).toHaveLength(0);
    expect(whatsApp.sent).toHaveLength(1);
  });

  it("persists but does not push when no recipient is configured", async () => {
    const { engine, whatsApp } = await staleEngine();
    const cycle = await runRefreshCycle(engine, engine.forFirm("default"));
    expect(cycle.newAlerts).toHaveLength(1);
    expect(whatsApp.sent).toHaveLength(0);
  });
});
