import {
  type Case,
  type CaseRepository,
  type Client,
  type ClientId,
  type ClientRepository,
  type Cnr,
  newClientId,
} from "@nowlez/contracts";

export interface ClientInput {
  readonly name: string;
  readonly phone?: string;
  readonly email?: string;
  readonly notes?: string;
}

/**
 * Client management (docs/clients.md): CRUD over the advocate's clients and the link between a
 * client and the cases they hold. A Case stays CNR-keyed (ADR-0001); assignment only sets the
 * case's local `clientId` (ADR-0017), so a client can hold many cases without changing case identity.
 */
export class ClientService {
  constructor(
    private readonly clients: ClientRepository,
    private readonly cases: CaseRepository,
  ) {}

  async createClient(input: ClientInput): Promise<Client> {
    const name = input.name.trim();
    if (!name) {
      throw new Error("A client needs a name.");
    }
    const client: Client = {
      id: newClientId(),
      name,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.email ? { email: input.email } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    };
    await this.clients.save(client);
    return client;
  }

  async getClient(id: ClientId): Promise<Client | undefined> {
    return this.clients.get(id);
  }

  async listClients(): Promise<readonly Client[]> {
    return this.clients.list();
  }

  /** Assign a case to a client, or pass `undefined` to clear the assignment. */
  async assignCase(cnr: Cnr, clientId: ClientId | undefined): Promise<void> {
    const existing = await this.cases.get(cnr);
    if (!existing) {
      throw new Error(`ClientService: case ${cnr} has not been added.`);
    }
    if (clientId && !(await this.clients.get(clientId))) {
      throw new Error(`ClientService: client ${clientId} does not exist.`);
    }
    await this.cases.save({ ...existing, clientId });
  }

  /** The cases held by a client. */
  async listClientCases(clientId: ClientId): Promise<readonly Case[]> {
    return (await this.cases.list()).filter((c) => c.clientId === clientId);
  }
}
