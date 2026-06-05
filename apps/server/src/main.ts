import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { buildServerEngine } from "./engine";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: createApp(buildServerEngine()).fetch, port }, (info) => {
  console.log(`NowLez API listening on http://localhost:${info.port}`);
});
