import { join } from "node:path";
import { AuthService, FakeGoogleVerifier, FakeOtpSender } from "@nowlez/auth";
import { CaseManagement, ClientService, DeadlineService } from "@nowlez/case-management";
import type {
  AlertStore,
  BlobStore,
  DocxReader,
  ModelClient,
  WhatsAppClient,
} from "@nowlez/contracts";
import { selectCourtDataSourceFromEnv } from "@nowlez/court-data";
import { MammothDocxReader, NodeVmDocxSandbox } from "@nowlez/document-handling";
import { IngestionPipeline } from "@nowlez/file-management";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { Munshi, type MunshiToolHandlers, munshiHandlers } from "@nowlez/munshi";
import {
  FileAlertStore,
  FileCaseRepository,
  FileClientRepository,
  FileDeadlineStore,
  FileFirmRepository,
  FileSessionStore,
  FileUserRepository,
} from "@nowlez/persistence";
import { FilesystemBlobStore } from "@nowlez/storage";
import { TrackingService } from "@nowlez/tracking";
import { selectWebSearch } from "@nowlez/web-search";
import { selectWhatsAppClient } from "@nowlez/whatsapp";
import { TokeninfoGoogleVerifier, whatsAppOtpSender } from "./auth-adapters";
import { type NotificationPreferences, notificationPreferencesFromEnv } from "./notifier";
import { buildOfficeRenderer } from "./pdf-renderer";

export interface ServerEngine {
  readonly caseManagement: CaseManagement;
  readonly clients: ClientService;
  readonly deadlines: DeadlineService;
  readonly auth: AuthService;
  readonly tracking: TrackingService;
  readonly munshi: Munshi;
  readonly handlers: MunshiToolHandlers;
  readonly ingestion: IngestionPipeline;
  readonly blobs: BlobStore;
  readonly docxReader: DocxReader;
  readonly alerts: AlertStore;
  readonly whatsApp: WhatsAppClient;
  readonly whatsAppVerifyToken: string;
  /** Optional WhatsApp number new alerts are pushed to (single-tenant stopgap). */
  readonly alertRecipient: string;
  /** Notification preferences (what gets pushed); defaults applied when omitted. */
  readonly notifications?: NotificationPreferences;
  /** Meta app secret for X-Hub-Signature-256 verification of inbound webhooks (empty = unverified). */
  readonly whatsAppAppSecret?: string;
  /** Phone numbers allowed to use the WhatsApp channel; empty = open to any sender. */
  readonly whatsAppAllowedSenders?: readonly string[];
}

/** Use the real Gemma endpoint when configured; otherwise a labelled offline stub. */
function resolveModel(): ModelClient {
  if (process.env.NOWLEZ_MODEL_BASE_URL) {
    return selectModelClient("openai-compatible");
  }
  return new FakeModelClient(() => ({
    text: JSON.stringify({
      text: "(stub Munshi reply — set NOWLEZ_MODEL_BASE_URL + NOWLEZ_MODEL_SMALL/LARGE to use Gemma 4.)",
      citations: [],
    }),
  }));
}

/** Wire the engine against the configured source, a durable store, the model, web search, and WhatsApp. */
export function buildServerEngine(): ServerEngine {
  const courts = selectCourtDataSourceFromEnv();
  const dir = process.env.NOWLEZ_DATA_DIR ?? join(process.cwd(), ".nowlez");
  const repo = new FileCaseRepository(join(dir, "cases.json"));
  // One durable blob store, shared by write_docx/read_docx and the file-download route.
  const blobs = new FilesystemBlobStore(join(dir, "blobs"));
  // One model client drives both the Munshi (large) and ingestion (small).
  const model = resolveModel();
  // One docx reader, shared by read_docx and the file text-preview route.
  const docxReader = new MammothDocxReader();
  // One WhatsApp client, shared by the channel, alert push, and (when live) OTP delivery.
  const whatsApp = selectWhatsAppClient(process.env.WHATSAPP_TOKEN ? "meta" : "fake");
  // Auth (ADR-0019): durable identity stores; OTP over WhatsApp and Google verification switch on by
  // env, else offline fakes. The phone unifies identity with the WhatsApp channel.
  const auth = new AuthService({
    users: new FileUserRepository(join(dir, "users.json")),
    firms: new FileFirmRepository(join(dir, "firms.json")),
    sessions: new FileSessionStore(join(dir, "sessions.json")),
    otp: process.env.WHATSAPP_TOKEN ? whatsAppOtpSender(whatsApp) : new FakeOtpSender(),
    google: process.env.GOOGLE_CLIENT_ID
      ? new TokeninfoGoogleVerifier(process.env.GOOGLE_CLIENT_ID)
      : new FakeGoogleVerifier(),
  });
  return {
    caseManagement: new CaseManagement(courts, repo),
    clients: new ClientService(new FileClientRepository(join(dir, "clients.json")), repo),
    deadlines: new DeadlineService(new FileDeadlineStore(join(dir, "deadlines.json")), repo),
    auth,
    tracking: new TrackingService(courts, repo),
    munshi: new Munshi(model),
    // write_docx/read_docx share the same repo + blob store, so an AI-drafted
    // .docx is attached to the persisted case and readable again later.
    handlers: munshiHandlers({
      courts,
      webSearch: selectWebSearch(process.env.TAVILY_API_KEY ? "tavily" : "fake"),
      docx: new NodeVmDocxSandbox(),
      docxReader,
      cases: repo,
      blobs,
    }),
    // Real rendering (pdfjs-dist + canvas for pages, LibreOffice for docx->pdf) is opt-in by env;
    // the offline fake stays the default so the mock court source (reference URIs, no real bytes)
    // and tests are unaffected.
    ingestion: new IngestionPipeline(
      process.env.NOWLEZ_PDF_RENDERER === "pdfjs" ? buildOfficeRenderer(blobs) : undefined,
      model,
    ),
    blobs,
    docxReader,
    alerts: new FileAlertStore(join(dir, "alerts.json")),
    whatsApp,
    whatsAppVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    alertRecipient: process.env.WHATSAPP_ALERT_RECIPIENT ?? "",
    notifications: notificationPreferencesFromEnv(),
    whatsAppAppSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    whatsAppAllowedSenders: (process.env.WHATSAPP_ALLOWED_SENDERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
