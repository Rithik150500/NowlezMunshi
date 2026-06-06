import { CaseManagement } from "@nowlez/case-management";
import { asOrderId } from "@nowlez/contracts";
import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import { FakeModelClient } from "@nowlez/model";
import { InMemoryAlertStore, InMemoryCaseRepository } from "@nowlez/persistence";
import { TrackingService } from "@nowlez/tracking";
import { describe, expect, it } from "vitest";
import { addCase, askMunshi, checkModels, listCases, refreshTracked } from "./cli";

describe("askMunshi", () => {
  it("returns the model's cited reply, formatted for the terminal", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        text: "Bail was granted.",
        citations: [{ kind: "order", orderId: "O1", page: 2 }],
      }),
    }));
    const out = await askMunshi(model, "What happened?", {}, [
      {
        cnr: SAMPLE_CNR,
        court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
        orders: [{ id: asOrderId("O1"), pages: 3, summary: "Bail order" }],
        files: [],
      },
    ]);
    expect(out).toContain("Bail was granted.");
    expect(out).toContain("[order:O1#2]");
  });

  it("omits the citations line when there are none", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({ text: "No documents yet.", citations: [] }),
    }));
    expect(await askMunshi(model, "anything?")).toBe("No documents yet.");
  });

  it("feeds the supplied case mini-details into the Munshi's context", async () => {
    let seen = "";
    const model = new FakeModelClient((req) => {
      seen = req.messages.map((m) => m.content).join("\n");
      return { text: JSON.stringify({ text: "noted", citations: [] }) };
    });
    await askMunshi(model, "summary?", {}, [
      {
        cnr: SAMPLE_CNR,
        court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
        orders: [],
        files: [],
      },
    ]);
    expect(seen).toContain(SAMPLE_CNR);
  });
});

describe("checkModels", () => {
  it("reports ok for both models when the client responds", async () => {
    const results = await checkModels(new FakeModelClient(() => ({ text: "pong" })));
    expect(results.map((r) => r.model)).toEqual(["small", "large"]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("reports failure (with the error) when the client throws", async () => {
    const results = await checkModels(
      new FakeModelClient(() => {
        throw new Error("connection refused");
      }),
    );
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results[0]?.detail).toContain("connection refused");
  });
});

describe("case commands", () => {
  it("adds a case, lists it, and refreshes without spurious alerts", async () => {
    const courts = new MockCourtDataSource();
    const repo = new InMemoryCaseRepository();
    const cm = new CaseManagement(courts, repo);
    const tracking = new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" });

    expect(await addCase(cm, SAMPLE_CNR)).toContain(SAMPLE_CNR);
    expect(await listCases(cm)).toContain(SAMPLE_CNR);
    expect(await refreshTracked(tracking, new InMemoryAlertStore())).toContain("Refreshed 1 case");
  });

  it("lists nothing before any case is added", async () => {
    const cm = new CaseManagement(new MockCourtDataSource(), new InMemoryCaseRepository());
    expect(await listCases(cm)).toContain("No cases yet");
  });
});
