/**
 * The Munshi's toolset and context package (docs/munshi.md). The Munshi is a
 * tool-calling agent over the larger Gemma model with six functions; its
 * context carries case mini-details plus behavioural instructions, and its
 * output is a cited response.
 *
 * Prompt templates, the agent loop, and stopping conditions are open questions
 * (open-questions.md#munshi); the tool input schemas here are the contract the
 * model is given.
 */
import { z } from "zod";
import { CitationSchema } from "./citations";
import type { CaseMiniDetail } from "./data-model";

/** The six functions the Munshi can call (munshi.md#the-toolset). */
export type MunshiToolName =
  | "read"
  | "web_search"
  | "read_docx"
  | "write_docx"
  | "ask_user_question"
  | "full_case_details";

// --- Tool input schemas ---

/** read: actual content of an order OR a file, over a page range. */
export const ReadToolInput = z.discriminatedUnion("target", [
  z.object({
    target: z.literal("order"),
    orderId: z.string().min(1),
    startPage: z.number().int().positive(),
    endPage: z.number().int().positive(),
  }),
  z.object({
    target: z.literal("file"),
    fileId: z.string().min(1),
    startPage: z.number().int().positive(),
    endPage: z.number().int().positive(),
  }),
]);

/** web_search: information not in the user's own documents, via Tavily. */
export const WebSearchToolInput = z.object({
  query: z.string().min(1),
});

/** read_docx: the "read docx skill" for working with a Word file. */
export const ReadDocxToolInput = z.object({
  fileId: z.string().min(1),
});

/**
 * write_docx: produce a Word document. The generated file gets a PDF preview
 * and is stored as an AI-drafted File against the CNR.
 */
export const WriteDocxToolInput = z.object({
  cnr: z.string().min(1),
  documentType: z.string().min(1),
  summary: z.string().min(1),
  docxJsCode: z.string().min(1),
  fileName: z.string().min(1),
});

/** ask_user_question: pause and request clarification rather than guessing. */
export const AskUserQuestionToolInput = z.object({
  question: z.string().min(1),
});

/** full_case_details: the complete record for a CNR when mini-details aren't enough. */
export const FullCaseDetailsToolInput = z.object({
  cnr: z.string().min(1),
});

export const MUNSHI_TOOL_INPUTS = {
  read: ReadToolInput,
  web_search: WebSearchToolInput,
  read_docx: ReadDocxToolInput,
  write_docx: WriteDocxToolInput,
  ask_user_question: AskUserQuestionToolInput,
  full_case_details: FullCaseDetailsToolInput,
} as const satisfies Record<MunshiToolName, z.ZodType>;

export interface MunshiToolDefinition {
  readonly name: MunshiToolName;
  readonly description: string;
  /** JSON Schema for the tool's input, suitable for an LLM tool-calling API. */
  readonly inputSchema: Record<string, unknown>;
}

const TOOL_DESCRIPTIONS: Record<MunshiToolName, string> = {
  read: "Retrieve the actual content of an order (by Order ID) or a file (by File ID) over a start/end page range, to go beyond the summary.",
  web_search:
    "Search the web (via Tavily) for information that is not in the user's own documents.",
  read_docx: "Read a Word (.docx) file the user has, to work with its contents.",
  write_docx:
    "Generate a Word document from docx-js code; it is rendered to a PDF preview and stored as an AI-drafted file against the CNR.",
  ask_user_question: "Pause and ask the user a clarifying question instead of guessing.",
  full_case_details:
    "Fetch the complete record for a CNR when the case mini-details in context are not enough.",
};

/**
 * The tool definitions (name + description + JSON Schema) the Munshi is given.
 * JSON Schema is derived from the zod input schemas.
 */
export function munshiToolDefinitions(): readonly MunshiToolDefinition[] {
  const names = Object.keys(MUNSHI_TOOL_INPUTS) as MunshiToolName[];
  return names.map((name) => ({
    name,
    description: TOOL_DESCRIPTIONS[name],
    inputSchema: z.toJSONSchema(MUNSHI_TOOL_INPUTS[name]) as Record<string, unknown>,
  }));
}

// --- Context package & response (munshi.md#context-assembly) ---

/**
 * The behavioural instructions carried alongside the content in the Munshi's
 * context package. Exact wording is an open question (open-questions.md#munshi);
 * this models the three slots the spec names.
 */
export interface MunshiInstructions {
  readonly inlineCitation: string;
  readonly toolFunctions: string;
  readonly askUserQuestion: string;
}

/**
 * What the Munshi is given before it reasons: mini-details across ALL of the
 * user's cases, plus the behavioural instructions.
 */
export interface MunshiContextPackage {
  readonly miniDetails: readonly CaseMiniDetail[];
  readonly instructions: MunshiInstructions;
}

/**
 * The Munshi's output: a cited response. When the task calls for it, a draft
 * document is also produced (via write_docx) and stored as a File.
 */
export const MunshiResponseSchema = z.object({
  text: z.string(),
  citations: z.array(CitationSchema),
});

export type MunshiResponse = z.infer<typeof MunshiResponseSchema>;
