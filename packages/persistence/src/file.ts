import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Case, CaseRepository, Cnr } from "@nowlez/contracts";

/**
 * A durable, dependency-free CaseRepository backed by a single JSON file.
 * Adequate for the single-advocate MVP; the recommended production engine
 * (SQLite) slots in behind the same port — see ADR-0007.
 */
export class FileCaseRepository implements CaseRepository {
  constructor(private readonly filePath: string) {}

  async save(value: Case): Promise<void> {
    const all = await this.readAll();
    all.set(value.cnr, value);
    await this.writeAll(all);
  }

  async get(cnr: Cnr): Promise<Case | undefined> {
    return (await this.readAll()).get(cnr);
  }

  async list(): Promise<readonly Case[]> {
    return [...(await this.readAll()).values()];
  }

  async delete(cnr: Cnr): Promise<boolean> {
    const all = await this.readAll();
    const existed = all.delete(cnr);
    if (existed) {
      await this.writeAll(all);
    }
    return existed;
  }

  private async readAll(): Promise<Map<string, Case>> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, Case>;
      return new Map(Object.entries(parsed));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }

  private async writeAll(all: Map<string, Case>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(Object.fromEntries(all), null, 2), "utf8");
  }
}
