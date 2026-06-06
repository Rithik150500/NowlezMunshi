import { asCnr, asOrderId, type Case } from "@nowlez/contracts";
import { MockCourtDataSource, SAMPLE_CNR, sampleFetchedCase } from "@nowlez/court-data";
import { InMemoryCaseRepository } from "@nowlez/persistence";
import { describe, expect, it } from "vitest";
import { diffCase, TrackingService } from "./index";

const COURT = {
  stateOrHighCourt: "Kerala",
  districtOrBench: "Ernakulam",
  court: "Principal District & Sessions Court",
};

function caseWith(orders: Case["orders"], details: Case["details"] = {}): Case {
  return { cnr: SAMPLE_CNR, court: COURT, details, tracking: true, orders, files: [] };
}

describe("diffCase", () => {
  it("alerts on new orders + hearing/status changes; other detail changes are silent", () => {
    const previous = caseWith([], {
      status: "Pending",
      caseType: "OS",
      nextHearingDate: "2026-06-01",
    });
    const latest = caseWith(
      [
        {
          id: asOrderId("O1"),
          cnr: SAMPLE_CNR,
          sourcePdf: { uri: "mock://o1.pdf", contentType: "application/pdf" },
          pageImages: [],
          summary: "",
        },
      ],
      { status: "Disposed", caseType: "WP", nextHearingDate: "2026-07-01" },
    );

    const changes = diffCase(previous, latest);
    const byLabel = (label: string) => changes.find((c) => c.summary.startsWith(label));
    expect(changes.find((c) => c.kind === "new-order")?.alertWorthy).toBe(true);
    expect(byLabel("Next hearing")?.alertWorthy).toBe(true);
    expect(byLabel("Status")?.alertWorthy).toBe(true);
    expect(byLabel("Case type")?.alertWorthy).toBe(false); // silent
  });
});

describe("TrackingService.refresh", () => {
  it("raises an alert for a newly-appeared order and persists the latest", async () => {
    const repo = new InMemoryCaseRepository();
    // Stored snapshot matches the source except a silent field (caseType) and the missing order,
    // so the only alert is the new order.
    await repo.save(caseWith([], { ...sampleFetchedCase.details, caseType: "WP" }));
    const ts = new TrackingService(new MockCourtDataSource(), repo, {
      now: () => "2026-06-05T00:00:00Z",
    });

    const result = await ts.refresh(SAMPLE_CNR);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.kind).toBe("new-order");
    expect(result.alerts[0]?.createdAt).toBe("2026-06-05T00:00:00Z");
    expect(result.updated.orders).toHaveLength(sampleFetchedCase.orders.length);
    // The case-type change is recorded but silent.
    expect(result.changes.some((c) => c.kind === "case-update" && !c.alertWorthy)).toBe(true);
    // The latest snapshot is persisted.
    expect((await repo.get(SAMPLE_CNR))?.orders).toHaveLength(1);
  });

  it("is idempotent: a second refresh with no changes raises nothing", async () => {
    const repo = new InMemoryCaseRepository();
    await repo.save(caseWith([], { status: "Disposed" }));
    const ts = new TrackingService(new MockCourtDataSource(), repo, {
      now: () => "2026-06-05T00:00:00Z",
    });

    await ts.refresh(SAMPLE_CNR);
    const second = await ts.refresh(SAMPLE_CNR);
    expect(second.alerts).toHaveLength(0);
    expect(second.changes).toHaveLength(0);
  });

  it("refreshAll covers tracked active cases; an unknown CNR throws", async () => {
    const repo = new InMemoryCaseRepository();
    const ts = new TrackingService(new MockCourtDataSource(), repo, {
      now: () => "2026-06-05T00:00:00Z",
    });

    await expect(ts.refresh(asCnr("NOPE"))).rejects.toThrow();

    await repo.save(caseWith([], { status: "Pending" }));
    expect(await ts.refreshAll()).toHaveLength(1);
  });

  it("refreshAll skips disposed cases (no point polling a decided matter)", async () => {
    const repo = new InMemoryCaseRepository();
    const ts = new TrackingService(new MockCourtDataSource(), repo, {
      now: () => "2026-06-05T00:00:00Z",
    });
    await repo.save(caseWith([], { status: "Disposed" }));
    expect(await ts.refreshAll()).toHaveLength(0);
  });
});
