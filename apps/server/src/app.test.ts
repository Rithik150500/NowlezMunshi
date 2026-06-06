import { CaseManagement } from "@nowlez/case-management";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { FakeModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
import { InMemoryCaseRepository } from "@nowlez/persistence";
import { TrackingService } from "@nowlez/tracking";
import { FakeWhatsAppClient } from "@nowlez/whatsapp";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ServerEngine } from "./engine";

function testEngine(): ServerEngine {
  const courts = new MockCourtDataSource();
  const repo = new InMemoryCaseRepository();
  const model = new FakeModelClient(() => ({
    text: JSON.stringify({ text: "ok", citations: [] }),
  }));
  return {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
    munshi: new Munshi(model),
    handlers: {},
    whatsApp: new FakeWhatsAppClient(),
    whatsAppVerifyToken: "secret",
  };
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("HTTP API", () => {
  it("reports health", async () => {
    const res = await createApp(testEngine()).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("adds, lists, and fetches a case", async () => {
    const app = createApp(testEngine());
    const add = await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    expect(add.status).toBe(201);

    const list = await app.request("/cases");
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const one = await app.request(`/cases/${SAMPLE_CNR}`);
    expect(one.status).toBe(200);
  });

  it("400s when adding a case without a CNR", async () => {
    const res = await createApp(testEngine()).request("/cases", post({}));
    expect(res.status).toBe(400);
  });

  it("answers the Munshi", async () => {
    const res = await createApp(testEngine()).request("/munshi", post({ message: "hi" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toBe("ok");
  });

  it("gives the Munshi the user's cases as context", async () => {
    const courts = new MockCourtDataSource();
    const repo = new InMemoryCaseRepository();
    let seen = "";
    const model = new FakeModelClient((req) => {
      seen = req.messages.map((m) => m.content).join("\n");
      return { text: JSON.stringify({ text: "ok", citations: [] }) };
    });
    const engine: ServerEngine = {
      caseManagement: new CaseManagement(courts, repo),
      tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
      munshi: new Munshi(model),
      handlers: {},
      whatsApp: new FakeWhatsAppClient(),
      whatsAppVerifyToken: "secret",
    };
    const app = createApp(engine);
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    await app.request("/munshi", post({ message: "what's listed?" }));
    expect(seen).toContain(SAMPLE_CNR);
  });

  it("refreshes tracked cases", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    const res = await app.request("/refresh", { method: "POST" });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

describe("WhatsApp webhook", () => {
  it("verifies the subscription with the challenge", async () => {
    const res = await createApp(testEngine()).request(
      "/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=12345",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("rejects verification with a bad token", async () => {
    const res = await createApp(testEngine()).request(
      "/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    );
    expect(res.status).toBe(403);
  });

  it("routes an inbound message to the Munshi and replies via WhatsApp", async () => {
    const engine = testEngine();
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "15551234567", type: "text", text: { body: "status?" } }],
              },
            },
          ],
        },
      ],
    };
    const res = await createApp(engine).request("/whatsapp", post(body));
    expect(res.status).toBe(200);
    expect((engine.whatsApp as FakeWhatsAppClient).sent[0]).toEqual({
      to: "15551234567",
      text: "ok",
    });
  });
});
