import { describe, expect, it } from "vitest";
import { describeConfig } from "./config";

describe("describeConfig", () => {
  it("reports the WhatsApp webhook as signature-verified when an app secret is set", () => {
    const status = describeConfig({ WHATSAPP_APP_SECRET: "shhh" });
    const webhook = status.find((s) => s.name === "whatsapp-webhook");
    expect(webhook?.live).toBe(true);
    expect(webhook?.mode).toBe("signature-verified");
    expect(JSON.stringify(status)).not.toContain("shhh");
  });

  it("reports all offline fakes/stubs by default", () => {
    const status = describeConfig({});
    expect(status.every((s) => !s.live)).toBe(true);
    expect(status.find((s) => s.name === "model")?.mode).toBe("stub");
    expect(status.find((s) => s.name === "court-data")?.mode).toBe("mock");
  });

  it("reports the daily briefing as on when enabled", () => {
    const status = describeConfig({ NOWLEZ_DAILY_BRIEFING: "1" });
    const briefing = status.find((s) => s.name === "daily-briefing");
    expect(briefing?.live).toBe(true);
    expect(briefing?.mode).toBe("on");
  });

  it("flags configured integrations as live (without leaking values)", () => {
    const status = describeConfig({
      NOWLEZ_COURT_SOURCE: "ecourts-web",
      NOWLEZ_MODEL_BASE_URL: "http://x/v1",
      TAVILY_API_KEY: "secret-key",
      NOWLEZ_REFRESH_INTERVAL_MS: "1000",
    });
    const live = new Set(status.filter((s) => s.live).map((s) => s.name));
    expect(live).toEqual(new Set(["court-data", "model", "web-search", "refresh-scheduler"]));
    // Modes describe the adapter, never the secret value.
    expect(JSON.stringify(status)).not.toContain("secret-key");
  });
});
