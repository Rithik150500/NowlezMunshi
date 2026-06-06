/**
 * @nowlez/persistence — CaseRepository (ADR-0007), AlertStore (ADR-0015), ClientRepository
 * (ADR-0017), and DeadlineStore adapters. The in-memory stores are the default; the file-backed
 * stores are durable for the MVP. The production engine (SQLite) slots in behind the same
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
export {
  type DeadlineStoreKind,
  type DeadlineStoreOptions,
  FileDeadlineStore,
  InMemoryDeadlineStore,
  selectDeadlineStore,
} from "./deadlines";
export { FileCaseRepository } from "./file";
export {
  FileFirmRepository,
  FileSessionStore,
  FileUserRepository,
  InMemoryFirmRepository,
  InMemorySessionStore,
  InMemoryUserRepository,
} from "./identity";
export { InMemoryCaseRepository } from "./in-memory";
export { type RepositoryKind, type RepositoryOptions, selectCaseRepository } from "./select";
