import { join } from "node:path";
import { CaseManagement } from "@nowlez/case-management";
import type { ModelClient, WhatsAppClient } from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { NodeVmDocxSandbox } from "@nowlez/document-handling";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { Munshi, type MunshiToolHandlers, munshiHandlers } from "@nowlez/munshi";
import { FileCaseRepository } from "@nowlez/persistence";
import { TrackingService } from "@nowlez/tracking";
import { selectWebSearch } from "@nowlez/web-search";
import { selectWhatsAppClient } from "@nowlez/whatsapp";

export interface ServerEngine {
  readonly caseManagement: CaseManagement;
  readonly tracking: TrackingService;
  readonly munshi: Munshi;
  readonly handlers: MunshiToolHandlers;
  readonly whatsApp: WhatsAppClient;
  readonly whatsAppVerifyToken: string;
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
  const courts = selectCourtDataSource();
  const dir = process.env.NOWLEZ_DATA_DIR ?? join(process.cwd(), ".nowlez");
  const repo = new FileCaseRepository(join(dir, "cases.json"));
  return {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo),
    munshi: new Munshi(resolveModel()),
    handlers: munshiHandlers({
      courts,
      webSearch: selectWebSearch(process.env.TAVILY_API_KEY ? "tavily" : "fake"),
      docx: new NodeVmDocxSandbox(),
    }),
    whatsApp: selectWhatsAppClient(process.env.WHATSAPP_TOKEN ? "meta" : "fake"),
    whatsAppVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  };
}
