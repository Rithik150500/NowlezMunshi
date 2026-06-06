/**
 * @nowlez/persistence — CaseRepository (ADR-0007), AlertStore (ADR-0015), and
 * ClientRepository adapters. The in-memory stores are the default; the file-backed stores are
 * durable for the MVP. The production engine (SQLite) slots in behind the same
 * ports later.
 */
export {
  type AlertStoreKind,
  type AlertStoreOptions,
  FileAlertStore,
  InMemoryAlertStore,
  selectAlertStore,
} from "./alerts";
export {
  type ClientRepositoryKind,
  type ClientRepositoryOptions,
  FileClientRepository,
  InMemoryClientRepository,
  selectClientRepository,
} from "./clients";
export { FileCaseRepository } from "./file";
export { InMemoryCaseRepository } from "./in-memory";
export { type RepositoryKind, type RepositoryOptions, selectCaseRepository } from "./select";
