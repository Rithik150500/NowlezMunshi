/**
 * Thrown by the Phase-1 stubs to make "not built yet" explicit and greppable,
 * and to carry the roadmap phase where the behaviour is scheduled to land.
 *
 * @see ../../../docs/roadmap.md
 */
export class NotImplementedError extends Error {
  constructor(
    what: string,
    readonly phase?: string,
  ) {
    super(
      phase
        ? `${what} is not implemented yet (scheduled for ${phase}).`
        : `${what} is not implemented yet.`,
    );
    this.name = "NotImplementedError";
  }
}
