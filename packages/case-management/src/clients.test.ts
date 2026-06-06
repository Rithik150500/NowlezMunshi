import { asClientId, asCnr, type Case } from "@nowlez/contracts";
import { InMemoryCaseRepository, InMemoryClientRepository } from "@nowlez/persistence";
import { describe, expect, it } from "vitest";
import { ClientService } from "./clients";

const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

const sampleCase = (cnr: string): Case => ({
  cnr: asCnr(cnr),
  court: COURT,
  details: {},
  tracking: true,
  orders: [],
  files: [],
});

describe("ClientService", () => {
  it("creates clients and assigns / lists / clears their cases", async () => {
    const cases = new InMemoryCaseRepository();
    await cases.save(sampleCase("C-1"));
    await cases.save(sampleCase("C-2"));
    const service = new ClientService(new InMemoryClientRepository(), cases);

    const asha = await service.createClient({ name: "Asha", phone: "15551230000" });
    expect(asha.id).toBeTruthy();
    expect(await service.listClients()).toHaveLength(1);

    await service.assignCase(asCnr("C-1"), asha.id);
    expect((await service.listClientCases(asha.id)).map((c) => c.cnr)).toEqual(["C-1"]);

    // Clearing the assignment drops the case from the client.
    await service.assignCase(asCnr("C-1"), undefined);
    expect(await service.listClientCases(asha.id)).toHaveLength(0);
  });

  it("rejects a blank name, an unknown case, or an unknown client", async () => {
    const cases = new InMemoryCaseRepository();
    await cases.save(sampleCase("C-1"));
    const service = new ClientService(new InMemoryClientRepository(), cases);

    await expect(service.createClient({ name: "  " })).rejects.toThrow();
    await expect(service.assignCase(asCnr("NOPE"), undefined)).rejects.toThrow();
    await expect(service.assignCase(asCnr("C-1"), asClientId("ghost"))).rejects.toThrow();
  });
});
