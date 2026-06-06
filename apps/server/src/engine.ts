import { join } from "node:path";
import { CaseManagement } from "@nowlez/case-management";
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
import { FileAlertStore, FileCaseRepository } from "@nowlez/persistence";
import { FilesystemBlobStore } from "@nowlez/storage";
import { TrackingService } from "@nowlez/tracking";
import { selectWebSearch } from "@nowlez/web-search";
import { selectWhatsAppClient } from "@nowlez/whatsapp";

export interface ServerEngine {
  readonly caseManagement: CaseManagement;
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
  return {
    caseManagement: new CaseManagement(courts, repo),
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
    ingestion: new IngestionPipeline(undefined, model),
    blobs,
    docxReader,
    alerts: new FileAlertStore(join(dir, "alerts.json")),
    whatsApp: selectWhatsAppClient(process.env.WHATSAPP_TOKEN ? "meta" : "fake"),
    whatsAppVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    alertRecipient: process.env.WHATSAPP_ALERT_RECIPIENT ?? "",
  };
}
