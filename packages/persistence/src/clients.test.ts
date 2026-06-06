import { asClientId, type Client } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryClientRepository } from "./clients";

const client = (id: string, name: string): Client => ({ id: asClientId(id), name });

describe("InMemoryClientRepository", () => {
  it("saves, gets, lists, and deletes clients", async () => {
    const repo = new InMemoryClientRepository();
    await repo.save(client("c1", "Asha"));
    await repo.save(client("c2", "Ravi"));

    expect((await repo.list()).map((c) => c.name).sort()).toEqual(["Asha", "Ravi"]);
    expect((await repo.get(asClientId("c1")))?.name).toBe("Asha");
    expect(await repo.delete(asClientId("c1"))).toBe(true);
    expect(await repo.get(asClientId("c1"))).toBeUndefined();
    expect(await repo.delete(asClientId("missing"))).toBe(false);
  });
});
