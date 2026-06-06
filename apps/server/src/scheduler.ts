import type { ServerEngine } from "./engine";
import { runRefreshCycle } from "./refresh";

export interface RefreshScheduler {
  stop(): void;
}

export interface RefreshSchedulerOptions {
  readonly intervalMs: number;
  /** Override the work each tick does (tests inject their own). Defaults to runRefreshCycle. */
  readonly runCycle?: () => Promise<unknown>;
  /** A failed cycle must not kill the scheduler — handle it here. */
  readonly onError?: (error: unknown) => void;
}

/**
 * Run the refresh cycle on a fixed interval — the daily tracking cycle. Scheduling lives
 * here (a deployment concern), deliberately outside the pure tracking engine. Cron / an
 * external scheduler can replace this by calling the same `runRefreshCycle`. The default cycle
 * **fans across every firm** (ADR-0019, 6b): each firm's own tracked cases are refreshed.
 */
export function startRefreshScheduler(
  engine: ServerEngine,
  options: RefreshSchedulerOptions,
): RefreshScheduler {
  const run =
    options.runCycle ??
    (async () => {
      for (const firm of await engine.firms.list()) {
        await runRefreshCycle(engine, engine.forFirm(firm.id));
      }
    });
  const timer = setInterval(() => {
    run().catch((error) => options.onError?.(error));
  }, options.intervalMs);
  // Don't let the scheduler alone hold the process open.
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
