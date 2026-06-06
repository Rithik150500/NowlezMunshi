import type { CaseRepository } from "@nowlez/contracts";
import { FileCaseRepository } from "./file";
import { InMemoryCaseRepository } from "./in-memory";

export type RepositoryKind = "memory" | "file";

export interface RepositoryOptions {
  /** Required when kind is "file": path to the JSON store. */
  filePath?: string;
}

/**
 * Select a CaseRepository implementation (ADR-0007). The default is the
 * in-memory store; switching to durable storage is changing the kind here.
 */
export function selectCaseRepository(
  kind: RepositoryKind = "memory",
  options: RepositoryOptions = {},
): CaseRepository {
  switch (kind) {
    case "memory":
      return new InMemoryCaseRepository();
    case "file": {
      if (!options.filePath) {
        throw new Error('selectCaseRepository("file") requires options.filePath');
      }
      return new FileCaseRepository(options.filePath);
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled repository kind: ${String(x)}`);
}
