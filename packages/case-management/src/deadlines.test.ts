import { asCnr, type Case } from "@nowlez/contracts";
import { InMemoryCaseRepository, InMemoryDeadlineStore } from "@nowlez/persistence";
import { describe, expect, it } from "vitest";
import { DeadlineService } from "./deadlines";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

const sampleCase = (cnr: string): Case => ({
  cnr: asCnr(cnr),
  court: COURT,
  details: {},
  tracking: true,
  orders: [],
  files: [],
});

describe("DeadlineService", () => {
  it("creates, lists, completes, and removes deadlines for a case", async () => {
    const cases = new InMemoryCaseRepository();
    await cases.save(sampleCase("C-1"));
    const service = new DeadlineService(
      new InMemoryDeadlineStore(),
      cases,
      () => "2026-06-01T00:00:00Z",
    );

    const created = await service.create({
      cnr: "C-1",
      title: "File appeal",
      dueDate: "2026-09-08",
      rule: "appeal-high-court",
    });
    expect(created.done).toBe(false);
    expect((await service.listForCase(asCnr("C-1"))).map((d) => d.title)).toEqual(["File appeal"]);

    expect(await service.complete(created.id)).toBe(true);
    expect((await service.list())[0]?.done).toBe(true);
    expect(await service.remove(created.id)).toBe(true);
    expect(await service.list()).toHaveLength(0);
  });

  it("rejects an unknown case, a blank title, or a bad date", async () => {
    const cases = new InMemoryCaseRepository();
    await cases.save(sampleCase("C-1"));
    const service = new DeadlineService(new InMemoryDeadlineStore(), cases);

    await expect(
      service.create({ cnr: "NOPE", title: "x", dueDate: "2026-09-08" }),
    ).rejects.toThrow();
    await expect(
      service.create({ cnr: "C-1", title: " ", dueDate: "2026-09-08" }),
    ).rejects.toThrow();
    await expect(
      service.create({ cnr: "C-1", title: "x", dueDate: "08-09-2026" }),
    ).rejects.toThrow();
  });
});
