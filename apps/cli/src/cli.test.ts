import { FakeModelClient } from "@nowlez/model";
import { describe, expect, it } from "vitest";
import { askMunshi } from "./cli";

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
