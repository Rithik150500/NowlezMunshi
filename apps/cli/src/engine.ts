import { join } from "node:path";
import { CaseManagement } from "@nowlez/case-management";
import type { AlertStore } from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { MammothDocxReader, NodeVmDocxSandbox } from "@nowlez/document-handling";
import { type MunshiToolHandlers, munshiHandlers } from "@nowlez/munshi";
import { FileAlertStore, FileCaseRepository } from "@nowlez/persistence";
import { FilesystemBlobStore } from "@nowlez/storage";
import { TrackingService } from "@nowlez/tracking";
import { selectWebSearch } from "@nowlez/web-search";

/** The CLI's durable data directory (cases + blobs). Override with NOWLEZ_DATA_DIR. */
export function dataDir(): string {
  return process.env.NOWLEZ_DATA_DIR ?? join(process.cwd(), ".nowlez");
}

/** Where the CLI persists cases (a durable JSON store). */
export function dataPath(): string {
  return join(dataDir(), "cases.json");
}

export interface Engine {
  readonly caseManagement: CaseManagement;
  readonly tracking: TrackingService;
  readonly handlers: MunshiToolHandlers;
  readonly alerts: AlertStore;
}

/** Wire the engine against the configured court-data source and a durable file store. */
export function buildEngine(): Engine {
  const courts = selectCourtDataSource();
  const dir = dataDir();
  const repo = new FileCaseRepository(join(dir, "cases.json"));
  return {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo),
    alerts: new FileAlertStore(join(dir, "alerts.json")),
    // write_docx/read_docx share the same repo + a durable blob store, so an
    // AI-drafted .docx is attached to the persisted case and readable again later.
    handlers: munshiHandlers({
      courts,
      webSearch: selectWebSearch(process.env.TAVILY_API_KEY ? "tavily" : "fake"),
      docx: new NodeVmDocxSandbox(),
      docxReader: new MammothDocxReader(),
      cases: repo,
      blobs: new FilesystemBlobStore(join(dir, "blobs")),
    }),
  };
}
