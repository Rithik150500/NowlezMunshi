import {
  type AuthPrincipal,
  asAlertId,
  asClientId,
  asCnr,
  asDeadlineId,
  type CourtScope,
  type FileDocument,
  newFileId,
  type Session,
  type User,
} from "@nowlez/contracts";
import { hearingPrepMessage } from "@nowlez/munshi";
import {
  buildClientUpdate,
  buildDailyBriefing,
  buildDeadlineDigest,
  buildHearingDigest,
  computeLimitationDeadline,
  formatClientUpdate,
  LIMITATION_RULES,
} from "@nowlez/tracking";
import {
  parseInboundMedia,
  parseInboundMessage,
  verifySignature,
  verifyWebhook,
} from "@nowlez/whatsapp";
import { Hono } from "hono";
import { describeConfig } from "./config";
import type { ServerEngine } from "./engine";
import { runRefreshCycle } from "./refresh";
import { handleWhatsAppFile, handleWhatsAppText } from "./whatsapp";

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A sensible download filename for a stored File, from its type + content type. */
const DOWNLOAD_EXT: Record<string, string> = {
  [DOCX_CONTENT_TYPE]: ".docx",
  "application/pdf": ".pdf",
};
function downloadName(file: FileDocument): string {
  const base = file.documentType.replace(/[^\w.-]+/g, "_") || "document";
  return `${base}${DOWNLOAD_EXT[file.original.contentType] ?? ""}`;
}

/** The authenticated principal is attached to the request context by the bearer middleware. */
type AppEnv = { Variables: { principal?: AuthPrincipal } };

/** Extract the bearer token from an `Authorization: Bearer <token>` header. */
function bearerToken(header: string | undefined): string | undefined {
  return /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1];
}

/** A session response — the bearer token + principal; never any credential. */
function sessionResponse(session: Session) {
  return {
    token: session.token,
    expiresAt: session.expiresAt,
    userId: session.userId,
    firmId: session.firmId,
    role: session.role,
  };
}

/** A user's public shape — never the password hash or Google subject id. */
function publicUser(user: User) {
  return {
    id: user.id,
    firmId: user.firmId,
    name: user.name,
    role: user.role,
    email: user.email,
    phone: user.phone,
  };
}

/** Routes reachable without a session: liveness, config, the auth endpoints, and the WhatsApp
 *  webhook (authenticated by signature, not a bearer token). Everything else is firm-owned. */
function isPublicPath(path: string): boolean {
  return (
    path === "/health" ||
    path === "/config" ||
    path === "/whatsapp" ||
    path === "/auth" ||
    path.startsWith("/auth/")
  );
}

/**
 * Build the HTTP API over a wired engine (ADR-0011). Using Hono means routes are
 * testable with `app.request()` — no socket required.
 */
export function createApp(engine: ServerEngine): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.onError((error, c) =>
    c.json({ error: error instanceof Error ? error.message : String(error) }, 500),
  );

  // Resolve a bearer token to the authenticated principal and attach it to the request context.
  // (6a: populated for /auth/me; enforcement across the rest of the API lands with tenant-scoping, 6b.)
  app.use("*", async (c, next) => {
    const token = bearerToken(c.req.header("authorization"));
    if (token) {
      const principal = await engine.auth.validate(token);
      if (principal) {
        c.set("principal", principal);
      }
    }
    await next();
  });

  // Enforce authentication on the firm-owned routes when NOWLEZ_REQUIRE_AUTH is set (default off so
  // dev/tests work without a token). Per-tenant data scoping (resolving forFirm) lands in 6b-2b.
  app.use("*", async (c, next) => {
    if (engine.requireAuth && !c.get("principal") && !isPublicPath(c.req.path)) {
      return c.json({ error: "unauthenticated" }, 401);
    }
    return next();
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Which integrations are live (real) vs offline fakes/stubs — for bringing externals online.
  app.get("/config", (c) => c.json(describeConfig()));

  // --- Auth & identity (ADR-0019): the three sign-in methods over the AuthService ---
  app.post("/auth/register", async (c) => {
    const body = await c.req.json<{
      firmName?: string;
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
    }>();
    if (!body.firmName || !body.name) {
      return c.json({ error: "firmName and name are required" }, 400);
    }
    try {
      const { firm, user, session } = await engine.auth.registerFirm({
        firmName: body.firmName,
        name: body.name,
        email: body.email,
        phone: body.phone,
        password: body.password,
      });
      return c.json({ ...sessionResponse(session), user: publicUser(user), firm }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "registration failed" }, 400);
    }
  });

  // Phone OTP: request always answers ok (never reveals whether the phone is registered).
  app.post("/auth/otp/request", async (c) => {
    const { phone } = await c.req.json<{ phone?: string }>();
    if (!phone) {
      return c.json({ error: "phone is required" }, 400);
    }
    await engine.auth.requestOtp(phone);
    return c.json({ ok: true });
  });

  app.post("/auth/otp/verify", async (c) => {
    const { phone, code } = await c.req.json<{ phone?: string; code?: string }>();
    if (!phone || !code) {
      return c.json({ error: "phone and code are required" }, 400);
    }
    try {
      return c.json(sessionResponse(await engine.auth.verifyOtp(phone, code)));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "verification failed" }, 401);
    }
  });

  app.post("/auth/login", async (c) => {
    const { email, password } = await c.req.json<{ email?: string; password?: string }>();
    if (!email || !password) {
      return c.json({ error: "email and password are required" }, 400);
    }
    try {
      return c.json(sessionResponse(await engine.auth.loginWithPassword(email, password)));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "login failed" }, 401);
    }
  });

  app.post("/auth/google", async (c) => {
    const { idToken } = await c.req.json<{ idToken?: string }>();
    if (!idToken) {
      return c.json({ error: "idToken is required" }, 400);
    }
    try {
      return c.json(sessionResponse(await engine.auth.loginWithGoogle(idToken)));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "login failed" }, 401);
    }
  });

  app.get("/auth/me", (c) => {
    const principal = c.get("principal");
    return principal ? c.json(principal) : c.json({ error: "unauthenticated" }, 401);
  });

  app.post("/auth/logout", async (c) => {
    const token = bearerToken(c.req.header("authorization"));
    if (token) {
      await engine.auth.logout(token);
    }
    return c.json({ ok: true });
  });

  app.get("/cases", async (c) => c.json(await engine.caseManagement.listCases()));

  app.post("/cases", async (c) => {
    const { cnr } = await c.req.json<{ cnr?: string }>();
    if (!cnr) {
      return c.json({ error: "cnr is required" }, 400);
    }
    return c.json(await engine.caseManagement.addCaseByCnr(asCnr(cnr)), 201);
  });

  // Discover cases at eCourts (not yet added): by party name or by case number, scoped
  // through the court hierarchy. Results carry a CNR to add via POST /cases.
  app.post("/search/party", async (c) => {
    const q = await c.req.json<{ scope?: CourtScope; partyName?: string; year?: number }>();
    if (!q.scope?.stateOrHighCourt || !q.partyName || !q.year) {
      return c.json({ error: "scope.stateOrHighCourt, partyName, and year are required" }, 400);
    }
    return c.json(
      await engine.caseManagement.searchByParty({
        scope: q.scope,
        partyName: q.partyName,
        year: q.year,
      }),
    );
  });

  app.post("/search/case-number", async (c) => {
    const q = await c.req.json<{
      scope?: CourtScope;
      caseType?: string;
      caseNumber?: string;
      year?: number;
    }>();
    if (!q.scope?.stateOrHighCourt || !q.caseType || !q.caseNumber || !q.year) {
      return c.json(
        { error: "scope.stateOrHighCourt, caseType, caseNumber, and year are required" },
        400,
      );
    }
    return c.json(
      await engine.caseManagement.searchByCaseNumber({
        scope: q.scope,
        caseType: q.caseType,
        caseNumber: q.caseNumber,
        year: q.year,
      }),
    );
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

  // Ingest a case's not-yet-summarised orders (court PDFs arrive raw): normalise ->
  // classify -> fill each order's summary + page images, so they enter the Munshi's context.
  app.post("/cases/:cnr/ingest", async (c) => {
    const found = await engine.caseManagement.getCase(asCnr(c.req.param("cnr")));
    if (!found) {
      return c.json({ error: "not found" }, 404);
    }
    const context = await engine.caseManagement.listMiniDetails();
    let ingested = 0;
    for (const order of found.orders) {
      if (order.summary !== "") {
        continue;
      }
      await engine.caseManagement.replaceOrder(await engine.ingestion.ingestOrder(order, context));
      ingested += 1;
    }
    return c.json({ ingested });
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

  // Serve a stored File's bytes from the blob store. `?disposition=inline` renders it in
  // the browser (the document viewer); the default downloads it as an attachment.
  app.get("/files/:fileId", async (c) => {
    const file = await engine.caseManagement.findFile(c.req.param("fileId"));
    if (!file) {
      return c.json({ error: "not found" }, 404);
    }
    const bytes = await engine.blobs.get(file.original);
    const disposition = c.req.query("disposition") === "inline" ? "inline" : "attachment";
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": file.original.contentType,
        "content-disposition": `${disposition}; filename="${downloadName(file)}"`,
      },
    });
  });

  // Extract a stored .docx File's text for the in-browser preview (the PDF renderer is
  // deferred, so the viewer shows text rather than a formatted render). Word documents only.
  app.get("/files/:fileId/text", async (c) => {
    const file = await engine.caseManagement.findFile(c.req.param("fileId"));
    if (!file) {
      return c.json({ error: "not found" }, 404);
    }
    if (file.original.contentType !== DOCX_CONTENT_TYPE) {
      return c.json({ error: "text preview is only available for .docx" }, 415);
    }
    const text = await engine.docxReader.extractText(await engine.blobs.get(file.original));
    return c.json({ text });
  });

  app.get("/cause-list", async (c) => {
    const date = c.req.query("date");
    if (!date) {
      return c.json({ error: "date query parameter is required" }, 400);
    }
    return c.json(await engine.caseManagement.getCauseListForUser(date));
  });

  // Upcoming hearings across the caseload — a read over stored next-hearing dates, bucketed
  // relative to today so the advocate never misses one (alerts-and-tracking.md#never-miss-a-hearing).
  // Optional `?today=` (reference day) and `?horizon=` (the "this week" window) override the defaults.
  app.get("/hearings", async (c) => {
    const today = c.req.query("today") || undefined;
    const horizon = c.req.query("horizon");
    const cases = await engine.caseManagement.listCases();
    return c.json(
      buildHearingDigest(cases, { today, horizonDays: horizon ? Number(horizon) : undefined }),
    );
  });

  // The daily briefing — the imminent hearings (overdue / today / tomorrow) plus the unread
  // alerts, composed for a notification or a quick read (alerts-and-tracking.md#the-daily-briefing).
  app.get("/briefing", async (c) => {
    const today = c.req.query("today") || undefined;
    const digest = buildHearingDigest(await engine.caseManagement.listCases(), { today });
    return c.json(buildDailyBriefing(digest, await engine.alerts.list()));
  });

  // Clients (docs/clients.md): the advocate's clients and the cases they hold. A case stays
  // CNR-keyed (ADR-0001); assignment only sets the case's local clientId (ADR-0017).
  app.get("/clients", async (c) => c.json(await engine.clients.listClients()));

  app.post("/clients", async (c) => {
    const body = await c.req.json<{
      name?: string;
      phone?: string;
      email?: string;
      notes?: string;
    }>();
    if (!body.name) {
      return c.json({ error: "name is required" }, 400);
    }
    const created = await engine.clients.createClient({
      name: body.name,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
    });
    return c.json(created, 201);
  });

  app.get("/clients/:id", async (c) => {
    const found = await engine.clients.getClient(asClientId(c.req.param("id")));
    return found ? c.json(found) : c.json({ error: "not found" }, 404);
  });

  app.get("/clients/:id/cases", async (c) =>
    c.json(await engine.clients.listClientCases(asClientId(c.req.param("id")))),
  );

  // Assign a case to a client (omit clientId to clear the assignment).
  app.post("/cases/:cnr/client", async (c) => {
    const { clientId } = await c.req.json<{ clientId?: string }>();
    await engine.clients.assignCase(
      asCnr(c.req.param("cnr")),
      clientId ? asClientId(clientId) : undefined,
    );
    return c.json({ ok: true });
  });

  // Compose a client-facing update (near-term hearings + recent alerts on the client's cases).
  app.get("/clients/:id/update", async (c) => {
    const client = await engine.clients.getClient(asClientId(c.req.param("id")));
    if (!client) {
      return c.json({ error: "not found" }, 404);
    }
    const cases = await engine.clients.listClientCases(client.id);
    const today = c.req.query("today") || undefined;
    return c.json(buildClientUpdate(client, cases, await engine.alerts.list(), { today }));
  });

  // Send the client update to the client over WhatsApp (needs a phone number on the client).
  app.post("/clients/:id/notify", async (c) => {
    const client = await engine.clients.getClient(asClientId(c.req.param("id")));
    if (!client) {
      return c.json({ error: "not found" }, 404);
    }
    if (!client.phone) {
      return c.json({ error: "client has no phone number" }, 400);
    }
    const cases = await engine.clients.listClientCases(client.id);
    const update = buildClientUpdate(client, cases, await engine.alerts.list());
    await engine.whatsApp.sendMessage(client.phone, formatClientUpdate(update));
    return c.json({ sent: true, to: client.phone });
  });

  // Deadlines & limitation (docs/deadlines.md): dated obligations on a case, plus a PROVISIONAL
  // limitation calculator. A deadline references its case by CNR but is stored separately.
  app.get("/limitation-rules", (c) => c.json(LIMITATION_RULES));

  // The upcoming-deadlines digest across the caseload (overdue / today / soon).
  app.get("/deadlines", async (c) => {
    const today = c.req.query("today") || undefined;
    return c.json(buildDeadlineDigest(await engine.deadlines.list(), { today }));
  });

  app.get("/cases/:cnr/deadlines", async (c) =>
    c.json(await engine.deadlines.listForCase(asCnr(c.req.param("cnr")))),
  );

  // Create a deadline: either an explicit `dueDate`, or `rule` + `baseDate` to compute it.
  app.post("/cases/:cnr/deadlines", async (c) => {
    const body = await c.req.json<{
      title?: string;
      dueDate?: string;
      rule?: string;
      baseDate?: string;
      notes?: string;
    }>();
    if (!body.title) {
      return c.json({ error: "title is required" }, 400);
    }
    let dueDate = body.dueDate;
    if (!dueDate && body.rule && body.baseDate) {
      const computed = computeLimitationDeadline(body.rule, body.baseDate);
      if (!computed) {
        return c.json({ error: "unknown limitation rule or invalid base date" }, 400);
      }
      dueDate = computed.dueDate;
    }
    if (!dueDate) {
      return c.json({ error: "dueDate (or rule + baseDate) is required" }, 400);
    }
    const created = await engine.deadlines.create({
      cnr: c.req.param("cnr"),
      title: body.title,
      dueDate,
      rule: body.rule,
      notes: body.notes,
    });
    return c.json(created, 201);
  });

  app.post("/deadlines/:id/done", async (c) => {
    const ok = await engine.deadlines.complete(asDeadlineId(c.req.param("id")));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  app.delete("/deadlines/:id", async (c) => {
    const ok = await engine.deadlines.remove(asDeadlineId(c.req.param("id")));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

  // Hearing-prep brief: run the Munshi over the caseload with a prep-focused prompt for this case;
  // returns the cited reply + tool-call trace (docs/deadlines.md#hearing-prep-brief).
  app.post("/cases/:cnr/prep-brief", async (c) => {
    const cnr = asCnr(c.req.param("cnr"));
    if (!(await engine.caseManagement.getCase(cnr))) {
      return c.json({ error: "not found" }, 404);
    }
    const context = engine.munshi.assembleContext(await engine.caseManagement.listMiniDetails());
    return c.json(await engine.munshi.run(hearingPrepMessage(cnr), context, engine.handlers));
  });

  // Refresh tracked cases, persist any alert-worthy changes, and (best-effort) push
  // the new alerts to a configured WhatsApp number. Returns the refresh results.
  app.post("/refresh", async (c) => c.json((await runRefreshCycle(engine)).results));

  // The alert feed: list persisted alerts (newest first) and mark one read.
  app.get("/alerts", async (c) => c.json(await engine.alerts.list()));

  app.post("/alerts/:id/read", async (c) => {
    const ok = await engine.alerts.markRead(asAlertId(c.req.param("id")));
    return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
  });

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
    // Authenticate the webhook: when an app secret is configured, the request must carry a
    // valid Meta X-Hub-Signature-256 over the raw body, else it is rejected (ADR-0013).
    const raw = await c.req.text();
    if (
      engine.whatsAppAppSecret &&
      !verifySignature(raw, c.req.header("x-hub-signature-256"), engine.whatsAppAppSecret)
    ) {
      return c.json({ error: "invalid signature" }, 403);
    }
    const body = JSON.parse(raw);
    const text = parseInboundMessage(body);
    const media = parseInboundMedia(body);
    // Authorise the sender: an allow-list (if set) restricts who can drive the channel.
    const allowed = engine.whatsAppAllowedSenders ?? [];
    const from = text?.from ?? media?.from;
    if (from && (allowed.length === 0 || allowed.includes(from))) {
      if (media) {
        // An uploaded file: run it through the ingestion pipeline and confirm the outcome.
        await engine.whatsApp.sendMessage(media.from, await handleWhatsAppFile(media, engine));
      } else if (text) {
        const reply = await handleWhatsAppText(text.text, engine);
        if (reply.kind === "document") {
          await engine.whatsApp.sendDocument(text.from, reply.document);
        } else {
          await engine.whatsApp.sendMessage(text.from, reply.text);
        }
      }
    }
    return c.json({ ok: true });
  });

  return app;
}
