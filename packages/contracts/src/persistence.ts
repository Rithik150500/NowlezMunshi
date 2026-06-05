/**
 * Persistence port for cases (docs/data-model.md), keyed by CNR (ADR-0001).
 * The concrete engine is deferred behind this port (ADR-0007); adapters live in
 * @nowlez/persistence — an in-memory store (default / tests) and a durable
 * file-backed store for the MVP.
 */
import type { Cnr } from "./brands";
import type { Case } from "./data-model";

export interface CaseRepository {
  /** Insert or replace a case (keyed by its CNR). */
  save(value: Case): Promise<void>;
  /** Fetch a case by CNR, or undefined if absent. */
  get(cnr: Cnr): Promise<Case | undefined>;
  /** All stored cases. */
  list(): Promise<readonly Case[]>;
  /** Remove a case; resolves to whether it existed. */
  delete(cnr: Cnr): Promise<boolean>;
}
