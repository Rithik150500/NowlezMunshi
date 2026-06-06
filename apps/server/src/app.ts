import { asCnr, type FileDocument, newFileId } from "@nowlez/contracts";
import { parseInboundMessage, verifyWebhook } from "@nowlez/whatsapp";
import { Hono } from "hono";
import type { ServerEngine } from "./engine";

/** A sensible download filename for a stored File, from its type + content type. */
const DOWNLOAD_EXT: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/pdf": ".pdf",
};
function downloadName(file: FileDocument): string {
  const base = file.documentType.replace(/[^\w.-]+/g, "_") || "document";
  return `${base}${DOWNLOAD_EXT[file.original.contentType] ?? ""}`;
}

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

  // Upload a document to a case: store its bytes and attach a user-uploaded File.
  // The summary + page images are filled later by ingestion (Phase 3).
  app.post("/cases/:cnr/files", async (c) => {
    const cnr = asCnr(c.req.param("cnr"));
    if (!(await engine.caseManagement.getCase(cnr))) {
      return c.json({ error: "not found" }, 404);
    }
    const body = await c.req.parseBody();
    const upload = body.file;
    if (!(upload instanceof File)) {
      return c.json({ error: "a 'file' part is required" }, 400);
    }
    const documentType =
      typeof body.documentType === "string" && body.documentType ? body.documentType : "uploaded";
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const original = await engine.blobs.put(bytes, upload.type || "application/octet-stream");
    const file: FileDocument = {
      id: newFileId(),
      cnr,
      original,
      pageImages: [],
      documentType,
      summary: "",
      origin: "user-uploaded",
    };
    await engine.caseManagement.attachFile(cnr, file);
    return c.json({ id: file.id, documentType, bytes: bytes.length }, 201);
  });

  // Ingest a stored File: normalise -> classify -> write documentType/summary/page
  // images back onto it, so its summary flows into the Munshi's context (Phase 3).
  app.post("/files/:fileId/ingest", async (c) => {
    const file = await engine.caseManagement.findFile(c.req.param("fileId"));
    if (!file) {
      return c.json({ error: "not found" }, 404);
    }
    const enriched = await engine.ingestion.ingest(
      file,
      await engine.caseManagement.listMiniDetails(),
    );
    await engine.caseManagement.replaceFile(enriched);
    return c.json({
      id: enriched.id,
      documentType: enriched.documentType,
      summary: enriched.summary,
      pages: enriched.pageImages.length,
    });
  });

  // Download a stored File's bytes (e.g. a .docx the Munshi drafted) from the blob store.
  app.get("/files/:fileId", async (c) => {
    const file = await engine.caseManagement.findFile(c.req.param("fileId"));
    if (!file) {
      return c.json({ error: "not found" }, 404);
    }
    const bytes = await engine.blobs.get(file.original);
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": file.original.contentType,
        "content-disposition": `attachment; filename="${downloadName(file)}"`,
      },
    });
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
    const context = engine.munshi.assembleContext(await engine.caseManagement.listMiniDetails());
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
        engine.munshi.assembleContext(await engine.caseManagement.listMiniDetails()),
        engine.handlers,
      );
      await engine.whatsApp.sendMessage(inbound.from, reply.text);
    }
    return c.json({ ok: true });
  });

  return app;
}
