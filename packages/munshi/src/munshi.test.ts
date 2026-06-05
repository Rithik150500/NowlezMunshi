import { asCnr } from "@nowlez/contracts";
import { FakeModelClient } from "@nowlez/model";
import { describe, expect, it } from "vitest";
import { DEFAULT_MUNSHI_INSTRUCTIONS, Munshi } from "./index";

describe("Munshi", () => {
  it("exposes the six tools", () => {
    expect(new Munshi().tools()).toHaveLength(6);
  });

  it("assembles a context package from mini-details + default instructions", () => {
    const ctx = new Munshi().assembleContext([
      {
        cnr: asCnr("KLER010012342026"),
        court: {
          stateOrHighCourt: "Kerala",
          districtOrBench: "Ernakulam",
          court: "Principal District & Sessions Court",
        },
        orders: [],
        files: [],
      },
    ]);
    expect(ctx.miniDetails).toHaveLength(1);
    expect(ctx.instructions).toBe(DEFAULT_MUNSHI_INSTRUCTIONS);
  });

  it("runs a single-turn cited completion via the larger model", async () => {
    const model = new FakeModelClient(() => ({
      text: JSON.stringify({
        text: "Bail was granted.",
        citations: [{ kind: "cnr", cnr: "KLER010012342026" }],
      }),
    }));
    const res = await new Munshi(model).run(
      "What happened?",
      new Munshi(model).assembleContext([]),
    );
    expect(res.text).toBe("Bail was granted.");
    expect(res.citations).toHaveLength(1);
  });

  it("rejects malformed model output (no text/citations)", async () => {
    const model = new FakeModelClient(() => ({ text: "{}" }));
    const m = new Munshi(model);
    await expect(m.run("x", m.assembleContext([]))).rejects.toThrow();
  });
});
