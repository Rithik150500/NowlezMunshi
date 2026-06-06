import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerEngine } from "./engine";
import { startRefreshScheduler } from "./scheduler";

afterEach(() => {
  vi.useRealTimers();
});

describe("startRefreshScheduler", () => {
  it("runs the cycle each interval and stops on stop()", async () => {
    vi.useFakeTimers();
    let runs = 0;
    const scheduler = startRefreshScheduler({} as ServerEngine, {
      intervalMs: 1000,
      runCycle: async () => {
        runs += 1;
      },
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(runs).toBe(3);

    scheduler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(runs).toBe(3); // no more ticks after stop()
  });

  it("keeps running when a cycle throws (errors routed to onError)", async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    let runs = 0;
    const scheduler = startRefreshScheduler({} as ServerEngine, {
      intervalMs: 1000,
      runCycle: async () => {
        runs += 1;
        throw new Error("boom");
      },
      onError: (error) => errors.push(error),
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(runs).toBe(2);
    expect(errors).toHaveLength(2);
    scheduler.stop();
  });
});
