/**
 * Persistence for the Alerts raised by the tracking engine
 * (docs/alerts-and-tracking.md), so they can be listed (the alert feed) and
 * marked read. Adapters: in-memory (default) + file-backed — see ADR-0015.
 */
import type { AlertId } from "./brands";
import type { Alert } from "./data-model";

export interface AlertStore {
  readonly id: string;
  /** Upsert by id (preserving read state); returns the alerts that were newly added. */
  save(alerts: readonly Alert[]): Promise<readonly Alert[]>;
  /** All alerts, newest first. */
  list(): Promise<readonly Alert[]>;
  /** Mark an alert read; returns whether it existed. */
  markRead(id: AlertId): Promise<boolean>;
}
