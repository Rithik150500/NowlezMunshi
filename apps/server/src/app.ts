import { asCnr } from "@nowlez/contracts";
import { parseInboundMessage, verifyWebhook } from "@nowlez/whatsapp";
import { Hono } from "hono";
import type { ServerEngine } from "./engine";

/**
 * Build the HTTP API over a wired engine (ADR-0011). Using Hono means routes are
 * testable with `app.request()` — no socket required.
 */
export function createApp(engine: ServerEngine): Hono {
  const app = new Hono();

  app.onError((error, c) =>
    c.json({ error: error instanceof Error ? error.message : String(error) }, 500),
  );

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/cases", async (c) => c.json(await engine.caseManagement.listCases()));

  app.post("/cases", async (c) => {
    const { cnr } = await c.req.json<{ cnr?: string }>();
    if (!cnr) {
      return c.json({ error: "cnr is required" }, 400);
    }
    return c.json(await engine.caseManagement.addCaseByCnr(asCnr(cnr)), 201);
  });

  app.get("/cases/:cnr", async (c) => {
    const found = await engine.caseManagement.getCase(asCnr(c.req.param("cnr")));
    return found ? c.json(found) : c.json({ error: "not found" }, 404);
  });

  app.post("/cases/:cnr/tracking", async (c) => {
    const { tracking } = await c.req.json<{ tracking?: boolean }>();
    await engine.caseManagement.setTracking(asCnr(c.req.param("cnr")), tracking ?? true);
    return c.json({ ok: true });
  });

  app.get("/cause-list", async (c) => {
    const date = c.req.query("date");
    if (!date) {
      return c.json({ error: "date query parameter is required" }, 400);
    }
    return c.json(await engine.caseManagement.getCauseListForUser(date));
  });

  app.post("/refresh", async (c) => c.json(await engine.tracking.refreshAll()));

  app.post("/munshi", async (c) => {
    const { message } = await c.req.json<{ message?: string }>();
    if (!message) {
      return c.json({ error: "message is required" }, 400);
    }
    const context = engine.munshi.assembleContext([]);
    return c.json(await engine.munshi.run(message, context, engine.handlers));
  });

  // WhatsApp webhook (ADR-0013): GET verifies the subscription; POST routes an
  // inbound text to the Munshi and sends the cited reply back.
  app.get("/whatsapp", (c) => {
    const challenge = verifyWebhook(
      {
        mode: c.req.query("hub.mode"),
        token: c.req.query("hub.verify_token"),
        challenge: c.req.query("hub.challenge"),
      },
      engine.whatsAppVerifyToken,
    );
    return challenge ? c.text(challenge) : c.json({ error: "verification failed" }, 403);
  });

  app.post("/whatsapp", async (c) => {
    const inbound = parseInboundMessage(await c.req.json());
    if (inbound) {
      const reply = await engine.munshi.run(
        inbound.text,
        engine.munshi.assembleContext([]),
        engine.handlers,
      );
      await engine.whatsApp.sendMessage(inbound.from, reply.text);
    }
    return c.json({ ok: true });
  });

  return app;
}
