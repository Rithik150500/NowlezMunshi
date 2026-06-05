import { join } from "node:path";
import { CaseManagement } from "@nowlez/case-management";
import { selectCourtDataSource } from "@nowlez/court-data";
import { FileCaseRepository } from "@nowlez/persistence";
import { TrackingService } from "@nowlez/tracking";

/** Where the CLI persists cases (a durable JSON store). Override with NOWLEZ_DATA_DIR. */
export function dataPath(): string {
  const dir = process.env.NOWLEZ_DATA_DIR ?? join(process.cwd(), ".nowlez");
  return join(dir, "cases.json");
}

export interface Engine {
  readonly caseManagement: CaseManagement;
  readonly tracking: TrackingService;
}

/** Wire the engine against the configured court-data source and a durable file store. */
export function buildEngine(): Engine {
  const courts = selectCourtDataSource();
  const repo = new FileCaseRepository(dataPath());
  return {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo),
  };
}
