import {
  type CaseMiniDetail,
  type ModelClient,
  type MunshiContextPackage,
  type MunshiInstructions,
  type MunshiResponse,
  MunshiResponseSchema,
  type MunshiToolDefinition,
  munshiToolDefinitions,
} from "@nowlez/contracts";
import { selectModelClient } from "@nowlez/model";

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

function serialiseMiniDetails(miniDetails: readonly CaseMiniDetail[]): string {
  if (miniDetails.length === 0) {
    return "The user has no cases yet.";
  }
  return miniDetails
    .map((c) => {
      const orders = c.orders.map((o) => `  - order ${o.id}: ${o.summary}`).join("\n");
      const files = c.files
        .map((f) => `  - file ${f.id} (${f.documentType}): ${f.summary}`)
        .join("\n");
      return [`CNR ${c.cnr} — ${c.court.court}`, orders, files].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

function buildSystemPrompt(instructions: MunshiInstructions): string {
  return [
    instructions.inlineCitation,
    instructions.toolFunctions,
    instructions.askUserQuestion,
    'Respond as strict JSON: {"text": string, "citations": Citation[]}, where each Citation is one of {"kind":"cnr","cnr":string}, {"kind":"order","orderId":string,"page":number}, {"kind":"file","fileId":string,"page":number}, or {"kind":"url","url":string}.',
  ].join("\n\n");
}

/**
 * The Munshi — the reasoning/drafting assistant (docs/munshi.md), over the larger
 * Gemma model via the ModelClient port (ADR-0009).
 *
 * `run` is a minimal single round-trip producing a cited response. The multi-turn
 * tool-execution loop (and the individual tool handlers — read, web search, write
 * docx) lands as those dependencies come online; `tools()` already exposes the
 * tool definitions.
 */
export class Munshi {
  constructor(private readonly model: ModelClient = selectModelClient()) {}

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

  /** Run the Munshi over the larger model and return a cited response. */
  async run(message: string, context: MunshiContextPackage): Promise<MunshiResponse> {
    const result = await this.model.complete({
      model: "large",
      responseFormat: "json",
      messages: [
        { role: "system", content: buildSystemPrompt(context.instructions) },
        {
          role: "user",
          content: `${serialiseMiniDetails(context.miniDetails)}\n\nUser: ${message}`,
        },
      ],
    });
    return MunshiResponseSchema.parse(JSON.parse(result.text));
  }
}
