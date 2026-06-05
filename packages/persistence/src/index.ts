/**
 * @nowlez/persistence — CaseRepository adapters (ADR-0007). The in-memory store
 * is the default; the file-backed store is durable for the MVP. The production
 * engine (SQLite) slots in behind the same port later.
 */
export { FileCaseRepository } from "./file";
export { InMemoryCaseRepository } from "./in-memory";
export { type RepositoryKind, type RepositoryOptions, selectCaseRepository } from "./select";
