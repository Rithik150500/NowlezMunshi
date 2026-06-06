import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { buildServerEngine } from "./engine";
import { startRefreshScheduler } from "./scheduler";

const port = Number(process.env.PORT ?? 3000);
const engine = buildServerEngine();

serve({ fetch: createApp(engine).fetch, port }, (info) => {
  console.log(`NowLez API listening on http://localhost:${info.port}`);
});

// Opt-in daily refresh: set NOWLEZ_REFRESH_INTERVAL_MS to run the tracking cycle on a timer.
const refreshIntervalMs = Number(process.env.NOWLEZ_REFRESH_INTERVAL_MS ?? 0);
if (refreshIntervalMs > 0) {
  startRefreshScheduler(engine, {
    intervalMs: refreshIntervalMs,
    onError: (error) => console.error("refresh cycle failed:", error),
  });
  console.log(`Refresh scheduler running every ${refreshIntervalMs}ms`);
}
