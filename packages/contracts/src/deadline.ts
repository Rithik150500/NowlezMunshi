/**
 * A **Deadline** — a dated obligation on a case (a limitation or filing due date) the advocate must
 * not miss (docs/deadlines.md). NowLez-local, like a [Client](./client.ts); it references its case
 * by CNR (ADR-0001) but never changes the case's identity. The due date may be entered directly or
 * **computed** from a limitation rule (`@nowlez/tracking`'s `computeLimitationDeadline`).
 */
import type { Cnr, DeadlineId } from "./brands";

export interface Deadline {
  readonly id: DeadlineId;
  readonly cnr: Cnr;
  readonly title: string;
  /** Due date, normalised YYYY-MM-DD. */
  readonly dueDate: string;
  /** The limitation-rule id this was computed from, if any (provisional catalogue). */
  readonly rule?: string;
  readonly notes?: string;
  readonly done: boolean;
  /** ISO 8601 timestamp. */
  readonly createdAt: string;
}

/**
 * Persistence port for deadlines (ADR-0007 pattern). Adapters live in
 * [`@nowlez/persistence`](../../persistence): in-memory (default / tests) + a durable file store.
 */
export interface DeadlineStore {
  /** Insert or replace a deadline (keyed by its id). */
  save(value: Deadline): Promise<void>;
  /** Fetch a deadline by id, or undefined if absent. */
  get(id: DeadlineId): Promise<Deadline | undefined>;
  /** All stored deadlines. */
  list(): Promise<readonly Deadline[]>;
  /** Remove a deadline; resolves to whether it existed. */
  delete(id: DeadlineId): Promise<boolean>;
}
