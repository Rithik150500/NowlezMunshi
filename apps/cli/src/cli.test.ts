import { FakeModelClient } from "@nowlez/model";
import { describe, expect, it } from "vitest";
import { askMunshi, checkModels } from "./cli";

describe("askMunshi", () => {
  it("returns the model's cited reply, formatted for the terminal", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        text: "Bail was granted.",
        citations: [{ kind: "order", orderId: "O1", page: 2 }],
      }),
    }));

    const out = await askMunshi(model, "What happened?");
    expect(out).toContain("Bail was granted.");
    expect(out).toContain("[order:O1#2]");
  });

  it("omits the citations line when there are none", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({ text: "No documents yet.", citations: [] }),
    }));
    const out = await askMunshi(model, "anything?");
    expect(out).toBe("No documents yet.");
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
