import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Deadline, DeadlineId, DeadlineStore } from "@nowlez/contracts";

/** The default DeadlineStore: a process-lifetime in-memory store. */
export class InMemoryDeadlineStore implements DeadlineStore {
  private readonly store = new Map<string, Deadline>();

  async save(value: Deadline): Promise<void> {
    this.store.set(value.id, value);
  }

  async get(id: DeadlineId): Promise<Deadline | undefined> {
    return this.store.get(id);
  }

  async list(): Promise<readonly Deadline[]> {
    return [...this.store.values()];
  }

  async delete(id: DeadlineId): Promise<boolean> {
    return this.store.delete(id);
  }
}

/** A durable, dependency-free DeadlineStore backed by a single JSON file. */
export class FileDeadlineStore implements DeadlineStore {
  constructor(private readonly filePath: string) {}

  async save(value: Deadline): Promise<void> {
    const all = await this.readAll();
    all.set(value.id, value);
    await this.writeAll(all);
  }

  async get(id: DeadlineId): Promise<Deadline | undefined> {
    return (await this.readAll()).get(id);
  }

  async list(): Promise<readonly Deadline[]> {
    return [...(await this.readAll()).values()];
  }

  async delete(id: DeadlineId): Promise<boolean> {
    const all = await this.readAll();
    const existed = all.delete(id);
    if (existed) {
      await this.writeAll(all);
    }
    return existed;
  }

  private async readAll(): Promise<Map<string, Deadline>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, Deadline>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }

  private async writeAll(all: Map<string, Deadline>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(all), null, 2), "utf8");
  }
}

export type DeadlineStoreKind = "memory" | "file";

export interface DeadlineStoreOptions {
  /** Required when kind is "file": path to the JSON store. */
  filePath?: string;
}

/** Select a DeadlineStore implementation; default is the in-memory store. */
export function selectDeadlineStore(
  kind: DeadlineStoreKind = "memory",
  options: DeadlineStoreOptions = {},
): DeadlineStore {
  switch (kind) {
    case "memory":
      return new InMemoryDeadlineStore();
    case "file": {
      if (!options.filePath) {
        throw new Error('selectDeadlineStore("file") requires options.filePath');
      }
      return new FileDeadlineStore(options.filePath);
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled deadline store kind: ${String(x)}`);
}
