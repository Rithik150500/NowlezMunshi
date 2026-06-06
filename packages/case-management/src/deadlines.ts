import {
  asCnr,
  type CaseRepository,
  type Cnr,
  type Deadline,
  type DeadlineId,
  type DeadlineStore,
  newDeadlineId,
} from "@nowlez/contracts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DeadlineInput {
  readonly cnr: string;
  readonly title: string;
  /** Due date as YYYY-MM-DD (entered directly, or computed via the limitation calculator). */
  readonly dueDate: string;
  readonly rule?: string;
  readonly notes?: string;
}

/**
 * Deadline management (docs/deadlines.md): CRUD over a case's [deadlines](../contracts/src/deadline.ts).
 * A deadline references its case by CNR (ADR-0001) and is stored separately, so it never changes the
 * case record. The due date is supplied by the caller — entered directly or computed from a
 * limitation rule (`@nowlez/tracking`); this service stays free of that date math.
 */
export class DeadlineService {
  constructor(
    private readonly deadlines: DeadlineStore,
    private readonly cases: CaseRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async create(input: DeadlineInput): Promise<Deadline> {
    const cnr = asCnr(input.cnr);
    if (!(await this.cases.get(cnr))) {
      throw new Error(`DeadlineService: case ${input.cnr} has not been added.`);
    }
    if (!input.title.trim()) {
      throw new Error("A deadline needs a title.");
    }
    if (!ISO_DATE.test(input.dueDate)) {
      throw new Error("A deadline needs a due date (YYYY-MM-DD).");
    }
    const deadline: Deadline = {
      id: newDeadlineId(),
      cnr,
      title: input.title.trim(),
      dueDate: input.dueDate,
      done: false,
      createdAt: this.now(),
      ...(input.rule ? { rule: input.rule } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    };
    await this.deadlines.save(deadline);
    return deadline;
  }

  async list(): Promise<readonly Deadline[]> {
    return this.deadlines.list();
  }

  async listForCase(cnr: Cnr): Promise<readonly Deadline[]> {
    return (await this.deadlines.list()).filter((d) => d.cnr === cnr);
  }

  /** Mark a deadline done; returns whether it existed. */
  async complete(id: DeadlineId): Promise<boolean> {
    const existing = await this.deadlines.get(id);
    if (!existing) {
      return false;
    }
    await this.deadlines.save({ ...existing, done: true });
    return true;
  }

  async remove(id: DeadlineId): Promise<boolean> {
    return this.deadlines.delete(id);
  }
}
