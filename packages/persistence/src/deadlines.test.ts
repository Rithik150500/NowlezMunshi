import { asCnr, asDeadlineId, type Deadline } from "@nowlez/contracts";
import { describe, expect, it } from "vitest";
import { InMemoryDeadlineStore } from "./deadlines";

const deadline = (id: string): Deadline => ({
  id: asDeadlineId(id),
  cnr: asCnr("C1"),
  title: `D ${id}`,
  dueDate: "2026-09-08",
  done: false,
  createdAt: "2026-06-01T00:00:00Z",
});

describe("InMemoryDeadlineStore", () => {
  it("saves, gets, lists, and deletes deadlines", async () => {
    const store = new InMemoryDeadlineStore();
    await store.save(deadline("d1"));
    await store.save(deadline("d2"));

    expect(await store.list()).toHaveLength(2);
    expect((await store.get(asDeadlineId("d1")))?.title).toBe("D d1");
    expect(await store.delete(asDeadlineId("d1"))).toBe(true);
    expect(await store.get(asDeadlineId("d1"))).toBeUndefined();
    expect(await store.delete(asDeadlineId("missing"))).toBe(false);
  });
});
