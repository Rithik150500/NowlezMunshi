import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Client, ClientId, ClientRepository } from "@nowlez/contracts";

/** The default ClientRepository: a process-lifetime in-memory store. */
export class InMemoryClientRepository implements ClientRepository {
  private readonly store = new Map<string, Client>();

  async save(value: Client): Promise<void> {
    this.store.set(value.id, value);
  }

  async get(id: ClientId): Promise<Client | undefined> {
    return this.store.get(id);
  }

  async list(): Promise<readonly Client[]> {
    return [...this.store.values()];
  }

  async delete(id: ClientId): Promise<boolean> {
    return this.store.delete(id);
  }
}

/** A durable, dependency-free ClientRepository backed by a single JSON file. */
export class FileClientRepository implements ClientRepository {
  constructor(private readonly filePath: string) {}

  async save(value: Client): Promise<void> {
    const all = await this.readAll();
    all.set(value.id, value);
    await this.writeAll(all);
  }

  async get(id: ClientId): Promise<Client | undefined> {
    return (await this.readAll()).get(id);
  }

  async list(): Promise<readonly Client[]> {
    return [...(await this.readAll()).values()];
  }

  async delete(id: ClientId): Promise<boolean> {
    const all = await this.readAll();
    const existed = all.delete(id);
    if (existed) {
      await this.writeAll(all);
    }
    return existed;
  }

  private async readAll(): Promise<Map<string, Client>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, Client>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }

  private async writeAll(all: Map<string, Client>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(all), null, 2), "utf8");
  }
}

export type ClientRepositoryKind = "memory" | "file";

export interface ClientRepositoryOptions {
  /** Required when kind is "file": path to the JSON store. */
  filePath?: string;
}

/** Select a ClientRepository implementation; default is the in-memory store. */
export function selectClientRepository(
  kind: ClientRepositoryKind = "memory",
  options: ClientRepositoryOptions = {},
): ClientRepository {
  switch (kind) {
    case "memory":
      return new InMemoryClientRepository();
    case "file": {
      if (!options.filePath) {
        throw new Error('selectClientRepository("file") requires options.filePath');
      }
      return new FileClientRepository(options.filePath);
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled client repository kind: ${String(x)}`);
}
