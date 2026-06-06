import { MockCourtDataSource, SAMPLE_CNR } from "@nowlez/court-data";
import {
  InMemoryAlertStore,
  InMemoryCaseRepository,
  InMemoryClientRepository,
  InMemoryDeadlineStore,
} from "@nowlez/persistence";
import { InMemoryBlobStore } from "@nowlez/storage";
import { describe, expect, it } from "vitest";
import { makeFirmScope } from "./firm-scope";

function scope() {
  return makeFirmScope({
    courts: new MockCourtDataSource(),
    blobs: new InMemoryBlobStore(),
    caseRepo: () => new InMemoryCaseRepository(),
    clientRepo: () => new InMemoryClientRepository(),
    deadlineStore: () => new InMemoryDeadlineStore(),
    alertStore: () => new InMemoryAlertStore(),
  });
}

describe("makeFirmScope", () => {
  it("isolates one firm's data from another's", async () => {
    const forFirm = scope();
    await forFirm("firm-a").caseManagement.addCaseByCnr(SAMPLE_CNR);
    expect(await forFirm("firm-a").caseManagement.listCases()).toHaveLength(1);
    // A different firm sees nothing.
    expect(await forFirm("firm-b").caseManagement.listCases()).toHaveLength(0);
  });

  it("returns the same (cached) services for a firm, so writes persist across calls", async () => {
    const forFirm = scope();
    expect(forFirm("firm-a")).toBe(forFirm("firm-a"));
    const created = await forFirm("firm-a").clients.createClient({ name: "Asha" });
    expect((await forFirm("firm-a").clients.listClients()).map((x) => x.id)).toEqual([created.id]);
    expect(await forFirm("firm-b").clients.listClients()).toHaveLength(0);
  });
});
