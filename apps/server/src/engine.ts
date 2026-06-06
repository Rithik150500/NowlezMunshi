import { join } from "node:path";
import { AuthService, FakeGoogleVerifier, FakeOtpSender } from "@nowlez/auth";
import type {
  BlobStore,
  DocxReader,
  FirmRepository,
  ModelClient,
  UserRepository,
  WhatsAppClient,
} from "@nowlez/contracts";
import { selectCourtDataSourceFromEnv } from "@nowlez/court-data";
import { MammothDocxReader, NodeVmDocxSandbox } from "@nowlez/document-handling";
import { IngestionPipeline } from "@nowlez/file-management";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
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
import { selectWebSearch } from "@nowlez/web-search";
import { selectWhatsAppClient } from "@nowlez/whatsapp";
import { TokeninfoGoogleVerifier, whatsAppOtpSender } from "./auth-adapters";
import { type FirmServices, makeFirmScope } from "./firm-scope";
import { type NotificationPreferences, notificationPreferencesFromEnv } from "./notifier";
import { buildOfficeRenderer } from "./pdf-renderer";

export interface ServerEngine {
  readonly auth: AuthService;
  /** Resolve the firm-owned, tenant-isolated services for a firm id (ADR-0019, 6b). */
  readonly forFirm: (firmId: string) => FirmServices;
  /** The firm (tenant) directory — for the scheduler to fan a refresh across firms. */
  readonly firms: FirmRepository;
  /** The user directory — to map a WhatsApp sender's phone to their firm. */
  readonly users: UserRepository;
  /** When true, the firm-owned routes reject unauthenticated requests (NOWLEZ_REQUIRE_AUTH). */
  readonly requireAuth?: boolean;
  readonly munshi: Munshi;
  readonly ingestion: IngestionPipeline;
  readonly blobs: BlobStore;
  readonly docxReader: DocxReader;
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
  // One durable blob store, shared by write_docx/read_docx and the file-download route.
  const blobs = new FilesystemBlobStore(join(dir, "blobs"));
  // One model client drives both the Munshi (large) and ingestion (small).
  const model = resolveModel();
  // One docx reader, shared by read_docx and the file text-preview route.
  const docxReader = new MammothDocxReader();
  // One WhatsApp client, shared by the channel, alert push, and (when live) OTP delivery.
  const whatsApp = selectWhatsAppClient(process.env.WHATSAPP_TOKEN ? "meta" : "fake");
  // Shared, firm-agnostic web search + docx sandbox (reused by every firm's Munshi handlers).
  const webSearch = selectWebSearch(process.env.TAVILY_API_KEY ? "tavily" : "fake");
  const docx = new NodeVmDocxSandbox();
  // Identity stores are shared (the directory of all firms/users), exposed for the scheduler + the
  // WhatsApp sender→firm lookup; the auth service and the engine read the same instances.
  const users = new FileUserRepository(join(dir, "users.json"));
  const firms = new FileFirmRepository(join(dir, "firms.json"));
  // Auth (ADR-0019): OTP over WhatsApp and Google verification switch on by env, else offline fakes.
  const auth = new AuthService({
    users,
    firms,
    sessions: new FileSessionStore(join(dir, "sessions.json")),
    otp: process.env.WHATSAPP_TOKEN ? whatsAppOtpSender(whatsApp) : new FakeOtpSender(),
    google: process.env.GOOGLE_CLIENT_ID
      ? new TokeninfoGoogleVerifier(process.env.GOOGLE_CLIENT_ID)
      : new FakeGoogleVerifier(),
  });
  // Per-firm, tenant-isolated services (ADR-0019, 6b): each firm's data lives under its own
  // directory, so one firm never sees another's cases / clients / deadlines / alerts.
  const forFirm = makeFirmScope({
    courts,
    blobs,
    webSearch,
    docx,
    docxReader,
    caseRepo: (f) => new FileCaseRepository(join(dir, "firms", f, "cases.json")),
    clientRepo: (f) => new FileClientRepository(join(dir, "firms", f, "clients.json")),
    deadlineStore: (f) => new FileDeadlineStore(join(dir, "firms", f, "deadlines.json")),
    alertStore: (f) => new FileAlertStore(join(dir, "firms", f, "alerts.json")),
  });
  return {
    forFirm,
    firms,
    users,
    requireAuth:
      process.env.NOWLEZ_REQUIRE_AUTH === "1" || process.env.NOWLEZ_REQUIRE_AUTH === "true",
    auth,
    munshi: new Munshi(model),
    // Real rendering (pdfjs-dist + canvas for pages, LibreOffice for docx->pdf) is opt-in by env;
    // the offline fake stays the default so the mock court source (reference URIs, no real bytes)
    // and tests are unaffected.
    ingestion: new IngestionPipeline(
      process.env.NOWLEZ_PDF_RENDERER === "pdfjs" ? buildOfficeRenderer(blobs) : undefined,
      model,
    ),
    blobs,
    docxReader,
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
