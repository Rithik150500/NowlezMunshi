import {
  type CaseMiniDetail,
  type MunshiContextPackage,
  type MunshiResponse,
  type MunshiToolDefinition,
  munshiToolDefinitions,
  NotImplementedError,
} from "@nowlez/contracts";

/**
 * The Munshi (stub) — context assembly, the larger-Gemma tool-calling loop, and
 * inline-citation discipline (docs/munshi.md). The toolset is defined now via
 * the contracts; the agent loop lands in Phase 4.
 */
export class Munshi {
  /** The six tools the agent can call. */
  tools(): readonly MunshiToolDefinition[] {
    return munshiToolDefinitions();
  }

  assembleContext(_miniDetails: readonly CaseMiniDetail[]): MunshiContextPackage {
    throw new NotImplementedError("Munshi.assembleContext", "Phase 4");
  }

  run(_message: string, _context: MunshiContextPackage): Promise<MunshiResponse> {
    throw new NotImplementedError("Munshi.run", "Phase 4");
  }
}
