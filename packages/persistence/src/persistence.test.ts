import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Alert, asAlertId, asCnr, type Case } from "@nowlez/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FileAlertStore,
  FileCaseRepository,
  InMemoryAlertStore,
  InMemoryCaseRepository,
  selectAlertStore,
  selectCaseRepository,
} from "./index";

function sampleAlert(id: string, createdAt = "2026-06-06T00:00:00Z"): Alert {
  return {
    id: asAlertId(id),
    cnr: asCnr("KLER010012342026"),
    kind: "new-order",
    message: `Alert ${id}`,
    createdAt,
    read: false,
  };
}

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

describe("InMemoryAlertStore", () => {
  it("upserts by id (returns only new), lists newest-first, marks read", async () => {
    const store = new InMemoryAlertStore();
    const added = await store.save([
      sampleAlert("a", "2026-06-01T00:00:00Z"),
      sampleAlert("b", "2026-06-02T00:00:00Z"),
    ]);
    expect(added).toHaveLength(2);

    // Re-saving an existing id adds nothing (no duplicates, read state preserved).
    expect(await store.save([sampleAlert("a")])).toHaveLength(0);

    const list = await store.list();
    expect(list.map((alert) => alert.id)).toEqual(["b", "a"]); // newest first

    expect(await store.markRead(asAlertId("a"))).toBe(true);
    expect(await store.markRead(asAlertId("missing"))).toBe(false);
    expect((await store.list()).find((alert) => alert.id === "a")?.read).toBe(true);
  });
});

describe("FileAlertStore", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nowlez-alerts-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists alerts across instances", async () => {
    const path = join(dir, "alerts.json");
    await new FileAlertStore(path).save([sampleAlert("a")]);
    const reopened = new FileAlertStore(path);
    expect(await reopened.list()).toHaveLength(1);
    expect(await reopened.markRead(asAlertId("a"))).toBe(true);
    expect((await new FileAlertStore(path).list())[0]?.read).toBe(true);
  });
});

describe("selectAlertStore", () => {
  it("defaults to memory and requires filePath for file", () => {
    expect(selectAlertStore()).toBeInstanceOf(InMemoryAlertStore);
    expect(() => selectAlertStore("file")).toThrow(/filePath/);
  });
});
