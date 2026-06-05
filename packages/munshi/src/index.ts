import {
  type CaseMiniDetail,
  type MunshiContextPackage,
  type MunshiInstructions,
  type MunshiResponse,
  type MunshiToolDefinition,
  munshiToolDefinitions,
  NotImplementedError,
} from "@nowlez/contracts";

/**
 * Default behavioural instructions for the Munshi's context package. PROVISIONAL:
 * the exact prompt wording is an open question (open-questions.md#munshi); these
 * are sensible defaults that callers may override.
 */
export const DEFAULT_MUNSHI_INSTRUCTIONS: MunshiInstructions = {
  inlineCitation:
    "Cite every claim inline to its source — a CNR, an Order ID + page, a File ID + page, or a web URL. Do not assert anything you cannot cite.",
  toolFunctions:
    "Use the tools to read real document pages, search the web, read or write Word documents, or fetch full case details when the mini-details are not enough.",
  askUserQuestion:
    "If the request is ambiguous or missing information, call ask_user_question rather than guessing.",
};

/**
 * The Munshi — the reasoning/drafting assistant (docs/munshi.md).
 *
 * The toolset and **context assembly** are implemented now; the larger-Gemma
 * **tool-calling loop** (`run`) lands in Phase 4, once a model endpoint is wired.
 */
export class Munshi {
  /** The six tools the agent can call. */
  tools(): readonly MunshiToolDefinition[] {
    return munshiToolDefinitions();
  }

  /**
   * Build the context package the Munshi reasons over: the case mini-details
   * across all of the user's cases, plus the behavioural instructions.
   */
  assembleContext(
    miniDetails: readonly CaseMiniDetail[],
    instructions: MunshiInstructions = DEFAULT_MUNSHI_INSTRUCTIONS,
  ): MunshiContextPackage {
    return { miniDetails, instructions };
  }

  run(_message: string, _context: MunshiContextPackage): Promise<MunshiResponse> {
    throw new NotImplementedError("Munshi.run (the larger-Gemma tool-calling loop)", "Phase 4");
  }
}
