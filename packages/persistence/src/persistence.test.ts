import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asCnr, type Case } from "@nowlez/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileCaseRepository, InMemoryCaseRepository, selectCaseRepository } from "./index";

function sampleCase(cnr = "KLER010012342026"): Case {
  return {
    cnr: asCnr(cnr),
    court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
    details: { parties: "A vs B" },
    tracking: true,
    orders: [],
    files: [],
  };
}

describe("InMemoryCaseRepository", () => {
  it("saves, gets, lists, and deletes", async () => {
    const repo = new InMemoryCaseRepository();
    const c = sampleCase();
    await repo.save(c);
    expect((await repo.get(c.cnr))?.cnr).toBe(c.cnr);
    expect(await repo.list()).toHaveLength(1);
    expect(await repo.delete(c.cnr)).toBe(true);
    expect(await repo.get(c.cnr)).toBeUndefined();
    expect(await repo.delete(c.cnr)).toBe(false);
  });
});

describe("FileCaseRepository", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nowlez-persistence-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists across instances (durable on disk)", async () => {
    const path = join(dir, "cases.json");
    await new FileCaseRepository(path).save(sampleCase());
    // A fresh instance reads what the previous one wrote.
    const reopened = new FileCaseRepository(path);
    expect(await reopened.list()).toHaveLength(1);
    expect((await reopened.get(asCnr("KLER010012342026")))?.tracking).toBe(true);
  });
});

describe("selectCaseRepository", () => {
  it("defaults to memory and requires filePath for file", () => {
    expect(selectCaseRepository()).toBeInstanceOf(InMemoryCaseRepository);
    expect(() => selectCaseRepository("file")).toThrow(/filePath/);
  });
});
