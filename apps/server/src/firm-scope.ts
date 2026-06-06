import { CaseManagement, ClientService, DeadlineService } from "@nowlez/case-management";
import type {
  AlertStore,
  BlobStore,
  CaseRepository,
  ClientRepository,
  CourtDataSource,
  DeadlineStore,
  DocxCompiler,
  DocxReader,
  WebSearch,
} from "@nowlez/contracts";
import { type MunshiToolHandlers, munshiHandlers } from "@nowlez/munshi";
import { TrackingService } from "@nowlez/tracking";

/**
 * The firm-owned services for one tenant (ADR-0019, 6b). Everything a logged-in user reads or
 * writes hangs off these; resolving them per request from the principal's `firmId` is what scopes
 * the API by tenant. The shared, firm-agnostic pieces (auth, the model, blobs, the WhatsApp client)
 * stay on the engine.
 */
export interface FirmServices {
  readonly caseManagement: CaseManagement;
  readonly clients: ClientService;
  readonly deadlines: DeadlineService;
  readonly tracking: TrackingService;
  readonly alerts: AlertStore;
  readonly handlers: MunshiToolHandlers;
}

export interface FirmScopeDeps {
  readonly courts: CourtDataSource;
  readonly blobs: BlobStore;
  /** Per-firm store factories — called once per firm (the result is cached), so each firm is isolated. */
  readonly caseRepo: (firmId: string) => CaseRepository;
  readonly clientRepo: (firmId: string) => ClientRepository;
  readonly deadlineStore: (firmId: string) => DeadlineStore;
  readonly alertStore: (firmId: string) => AlertStore;
  /** Optional Munshi-handler dependencies; when all present, per-firm `write_docx` / `read` work. */
  readonly webSearch?: WebSearch;
  readonly docx?: DocxCompiler;
  readonly docxReader?: DocxReader;
}

/**
 * Build a **cached, per-firm** service factory. Each firm gets its own case / client / deadline /
 * alert stores (and Munshi handlers over them), so one firm can never read or write another's data.
 * Two calls for the same firm return the same instances (so writes are visible to later reads).
 */
export function makeFirmScope(deps: FirmScopeDeps): (firmId: string) => FirmServices {
  const cache = new Map<string, FirmServices>();
  return (firmId: string): FirmServices => {
    const cached = cache.get(firmId);
    if (cached) {
      return cached;
    }
    const cases = deps.caseRepo(firmId);
    const handlers =
      deps.webSearch && deps.docx && deps.docxReader
        ? munshiHandlers({
            courts: deps.courts,
            webSearch: deps.webSearch,
            docx: deps.docx,
            docxReader: deps.docxReader,
            cases,
            blobs: deps.blobs,
          })
        : {};
    const services: FirmServices = {
      caseManagement: new CaseManagement(deps.courts, cases),
      clients: new ClientService(deps.clientRepo(firmId), cases),
      deadlines: new DeadlineService(deps.deadlineStore(firmId), cases),
      tracking: new TrackingService(deps.courts, cases),
      alerts: deps.alertStore(firmId),
      handlers,
    };
    cache.set(firmId, services);
    return services;
  };
}
