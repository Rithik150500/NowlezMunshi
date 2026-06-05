import type { Case, CaseRepository, Cnr } from "@nowlez/contracts";

/** The default CaseRepository: a process-lifetime in-memory store. */
export class InMemoryCaseRepository implements CaseRepository {
  private readonly store = new Map<Cnr, Case>();

  async save(value: Case): Promise<void> {
    this.store.set(value.cnr, value);
  }

  async get(cnr: Cnr): Promise<Case | undefined> {
    return this.store.get(cnr);
  }

  async list(): Promise<readonly Case[]> {
    return [...this.store.values()];
  }

  async delete(cnr: Cnr): Promise<boolean> {
    return this.store.delete(cnr);
  }
}
