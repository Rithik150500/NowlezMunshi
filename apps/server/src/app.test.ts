import { CaseManagement } from "@nowlez/case-management";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { FakeModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
import { InMemoryCaseRepository } from "@nowlez/persistence";
import { TrackingService } from "@nowlez/tracking";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

function testApp() {
  const courts = new MockCourtDataSource();
  const repo = new InMemoryCaseRepository();
  const model = new FakeModelClient(() => ({
    text: JSON.stringify({ text: "ok", citations: [] }),
  }));
  return createApp({
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
    munshi: new Munshi(model),
    handlers: {},
  });
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("HTTP API", () => {
  it("reports health", async () => {
    const res = await testApp().request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("adds, lists, and fetches a case", async () => {
    const app = testApp();
    const add = await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    expect(add.status).toBe(201);

    const list = await app.request("/cases");
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const one = await app.request(`/cases/${SAMPLE_CNR}`);
    expect(one.status).toBe(200);
  });

  it("400s when adding a case without a CNR", async () => {
    const res = await testApp().request("/cases", post({}));
    expect(res.status).toBe(400);
  });

  it("answers the Munshi", async () => {
    const res = await testApp().request("/munshi", post({ message: "hi" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toBe("ok");
  });

  it("refreshes tracked cases", async () => {
    const app = testApp();
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    const res = await app.request("/refresh", { method: "POST" });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});
