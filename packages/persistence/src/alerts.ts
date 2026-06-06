import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Alert, AlertId, AlertStore } from "@nowlez/contracts";

/** Newest-first by creation time — the order the alert feed is read in. */
function newestFirst(alerts: Alert[]): Alert[] {
  return alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Add only alerts whose id is not already present; returns the ones added. */
function upsertNew(store: Map<string, Alert>, alerts: readonly Alert[]): Alert[] {
  const added: Alert[] = [];
  for (const alert of alerts) {
    if (!store.has(alert.id)) {
      store.set(alert.id, alert);
      added.push(alert);
    }
  }
  return added;
}

/** The default AlertStore: a process-lifetime in-memory store. */
export class InMemoryAlertStore implements AlertStore {
  readonly id = "memory";
  private readonly store = new Map<string, Alert>();

  async save(alerts: readonly Alert[]): Promise<readonly Alert[]> {
    return upsertNew(this.store, alerts);
  }

  async list(): Promise<readonly Alert[]> {
    return newestFirst([...this.store.values()]);
  }

  async markRead(id: AlertId): Promise<boolean> {
    const existing = this.store.get(id);
    if (!existing) {
      return false;
    }
    this.store.set(id, { ...existing, read: true });
    return true;
  }
}

/** A durable, dependency-free AlertStore backed by a single JSON file. */
export class FileAlertStore implements AlertStore {
  readonly id = "file";
  constructor(private readonly filePath: string) {}

  async save(alerts: readonly Alert[]): Promise<readonly Alert[]> {
    const all = await this.readAll();
    const added = upsertNew(all, alerts);
    if (added.length > 0) {
      await this.writeAll(all);
    }
    return added;
  }

  async list(): Promise<readonly Alert[]> {
    return newestFirst([...(await this.readAll()).values()]);
  }

  async markRead(id: AlertId): Promise<boolean> {
    const all = await this.readAll();
    const existing = all.get(id);
    if (!existing) {
      return false;
    }
    all.set(id, { ...existing, read: true });
    await this.writeAll(all);
    return true;
  }

  private async readAll(): Promise<Map<string, Alert>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, Alert>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }

  private async writeAll(all: Map<string, Alert>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(all), null, 2), "utf8");
  }
}

export type AlertStoreKind = "memory" | "file";

export interface AlertStoreOptions {
  /** Required when kind is "file": path to the JSON store. */
  filePath?: string;
}

/** Select an AlertStore implementation (ADR-0015); default is the in-memory store. */
export function selectAlertStore(
  kind: AlertStoreKind = "memory",
  options: AlertStoreOptions = {},
): AlertStore {
  switch (kind) {
    case "memory":
      return new InMemoryAlertStore();
    case "file": {
      if (!options.filePath) {
        throw new Error('selectAlertStore("file") requires options.filePath');
      }
      return new FileAlertStore(options.filePath);
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled alert store kind: ${String(x)}`);
}
