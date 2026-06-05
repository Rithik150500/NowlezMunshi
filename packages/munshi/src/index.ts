import {
  asCnr,
  type CaseMiniDetail,
  type CourtDataSource,
  FullCaseDetailsToolInput,
  type ModelClient,
  type ModelMessage,
  type ModelToolDef,
  type MunshiContextPackage,
  type MunshiInstructions,
  type MunshiResponse,
  MunshiResponseSchema,
  type MunshiToolDefinition,
  type MunshiToolName,
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

/** Executes one Munshi tool call and returns a string result fed back to the model. */
export type MunshiToolHandler = (args: unknown) => Promise<string>;
export type MunshiToolHandlers = Partial<Record<MunshiToolName, MunshiToolHandler>>;

/** Upper bound on tool-call rounds, so the loop always terminates. */
const MAX_STEPS = 6;

/**
 * The Munshi — the reasoning/drafting assistant (docs/munshi.md), a tool-calling
 * agent over the larger Gemma model via the ModelClient port (ADR-0009).
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

  /**
   * Run the multi-turn tool-calling loop over the larger model and return a cited
   * response. The model may call tools; each call is dispatched to a handler (tools
   * without a handler report back as unavailable). `ask_user_question` short-circuits
   * — the Munshi turns the question back to the user.
   */
  async run(
    message: string,
    context: MunshiContextPackage,
    handlers: MunshiToolHandlers = {},
  ): Promise<MunshiResponse> {
    const toolDefs = toModelToolDefs(this.tools());
    const messages: ModelMessage[] = [
      { role: "system", content: buildSystemPrompt(context.instructions) },
      { role: "user", content: `${serialiseMiniDetails(context.miniDetails)}\n\nUser: ${message}` },
    ];

    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await this.model.complete({ model: "large", tools: toolDefs, messages });

      if (!result.toolCalls || result.toolCalls.length === 0) {
        return MunshiResponseSchema.parse(JSON.parse(result.text));
      }

      // ask-user-question short-circuits: turn the question back to the user.
      const ask = result.toolCalls.find((call) => call.name === "ask_user_question");
      if (ask) {
        return { text: extractQuestion(ask.arguments), citations: [] };
      }

      messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: await dispatch(handlers, call.name, call.arguments),
        });
      }
    }

    throw new Error(`Munshi.run did not converge within ${MAX_STEPS} steps.`);
  }
}

/**
 * Build tool handlers from the dependencies available (ADR-0009). Currently wires
 * `full_case_details` via the CourtDataSource; `web_search` (Tavily) and
 * `write_docx` (docx execution) arrive with their dependencies.
 */
export interface MunshiToolDeps {
  readonly courts?: CourtDataSource;
}

export function munshiHandlers(deps: MunshiToolDeps): MunshiToolHandlers {
  const handlers: MunshiToolHandlers = {};
  const courts = deps.courts;
  if (courts) {
    handlers.full_case_details = async (args) => {
      const { cnr } = FullCaseDetailsToolInput.parse(args);
      const fetched = await courts.getCaseByCnr(asCnr(cnr));
      return JSON.stringify({
        cnr: fetched.cnr,
        court: fetched.court,
        details: fetched.details,
        orderCount: fetched.orders.length,
      });
    };
  }
  return handlers;
}

async function dispatch(
  handlers: MunshiToolHandlers,
  name: string,
  rawArgs: string,
): Promise<string> {
  const handler = handlers[name as MunshiToolName];
  if (!handler) {
    return `Tool "${name}" is not available yet.`;
  }
  try {
    return await handler(parseArgs(rawArgs));
  } catch (error) {
    return `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function toModelToolDefs(defs: readonly MunshiToolDefinition[]): ModelToolDef[] {
  return defs.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: def.inputSchema,
  }));
}

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
    'When you have the answer, respond as strict JSON: {"text": string, "citations": Citation[]}, where each Citation is one of {"kind":"cnr","cnr":string}, {"kind":"order","orderId":string,"page":number}, {"kind":"file","fileId":string,"page":number}, or {"kind":"url","url":string}.',
  ].join("\n\n");
}

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function extractQuestion(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { question?: unknown };
    return typeof parsed.question === "string"
      ? parsed.question
      : "Could you clarify your request?";
  } catch {
    return "Could you clarify your request?";
  }
}
