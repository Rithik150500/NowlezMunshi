/**
 * The **Client** — the advocate's client (docs/clients.md), a NowLez-local entity that is *not*
 * part of eCourts. A Case is still keyed solely by its CNR (ADR-0001); a client is **linked** to a
 * case through the case's optional `clientId` (a local attribute, like the tracking flag), so one
 * client can hold many cases without changing the case's identity. See ADR-0017.
 */
import type { ClientId } from "./brands";

export interface Client {
  readonly id: ClientId;
  readonly name: string;
  /** Contact number — also where client updates are delivered (WhatsApp). */
  readonly phone?: string;
  readonly email?: string;
  readonly notes?: string;
}

/**
 * Persistence port for clients (ADR-0007 pattern). Adapters live in
 * [`@nowlez/persistence`](../../persistence): in-memory (default / tests) + a durable file store.
 */
export interface ClientRepository {
  /** Insert or replace a client (keyed by its id). */
  save(value: Client): Promise<void>;
  /** Fetch a client by id, or undefined if absent. */
  get(id: ClientId): Promise<Client | undefined>;
  /** All stored clients. */
  list(): Promise<readonly Client[]>;
  /** Remove a client; resolves to whether it existed. */
  delete(id: ClientId): Promise<boolean>;
}
