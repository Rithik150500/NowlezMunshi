import {
  asCnr,
  type BlobStore,
  type CaseMiniDetail,
  type CaseRepository,
  type CitationAuthority,
  type CitationInput,
  type CourtDataSource,
  type DocxCompiler,
  type DocxReader,
  type FileDocument,
  FullCaseDetailsToolInput,
  formatCitation,
  isKnownCitation,
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
  newFileId,
  parseModelJson,
  ReadDocxToolInput,
  ReadToolInput,
  toCitation,
  unknownCitations,
  type WebSearch,
  WebSearchToolInput,
  WriteDocxToolInput,
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

/**
 * A **hearing-prep brief** prompt (docs/deadlines.md#hearing-prep-brief): ask the Munshi to prepare
 * the advocate for the next hearing in a case — the matter in brief, recent orders, the next date,
 * and the points/actions to be ready for — each cited to its source. Run through `Munshi.run` over
 * the caseload context, so the citation discipline and tools apply.
 */
export function hearingPrepMessage(cnr: string): string {
  return [
    `Prepare me for the next hearing in case ${cnr}.`,
    "Summarise the matter, the most recent orders, the next hearing date, and the key points or",
    "actions I should be ready for. Cite each point to its source (CNR / order / file).",
  ].join(" ");
}

/** Executes one Munshi tool call and returns a string result fed back to the model. */
export type MunshiToolHandler = (args: unknown) => Promise<string>;
export type MunshiToolHandlers = Partial<Record<MunshiToolName, MunshiToolHandler>>;

/** One tool the Munshi invoked during a run — surfaced so the UI can show it being agentic. */
export interface MunshiToolInvocation {
  readonly name: string;
  readonly arguments: string;
  /** false when the tool had no handler or threw. */
  readonly ok: boolean;
}

/** A cited response plus the trace of tools the Munshi called to get there. */
export interface MunshiRunResult extends MunshiResponse {
  readonly toolCalls: readonly MunshiToolInvocation[];
}

/** Upper bound on tool-call rounds, so the loop always terminates. */
const MAX_STEPS = 6;

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
  ): Promise<MunshiRunResult> {
    const toolDefs = toModelToolDefs(this.tools());
    const authority = buildCitationAuthority(context.miniDetails);
    const messages: ModelMessage[] = [
      { role: "system", content: buildSystemPrompt(context.instructions) },
      { role: "user", content: `${serialiseMiniDetails(context.miniDetails)}\n\nUser: ${message}` },
    ];
    const toolCalls: MunshiToolInvocation[] = [];
    let citationCorrectionUsed = false;

    for (let step = 0; step < MAX_STEPS; step++) {
      const result = await this.model.complete({ model: "large", tools: toolDefs, messages });

      if (!result.toolCalls || result.toolCalls.length === 0) {
        const response = parseModelJson(result.text, MunshiResponseSchema);
        const unknown = unknownCitations(response.citations, authority);
        // Give the model one chance to fix hallucinated citations before we act.
        if (unknown.length > 0 && !citationCorrectionUsed && step < MAX_STEPS - 1) {
          citationCorrectionUsed = true;
          messages.push({ role: "assistant", content: result.text });
          messages.push({ role: "user", content: citationCorrectionPrompt(unknown, authority) });
          continue;
        }
        // Enforcement: never surface a citation we cannot verify against the caseload.
        return {
          text: response.text,
          citations: response.citations.filter((c) => isKnownCitation(c, authority)),
          toolCalls,
        };
      }

      // ask-user-question short-circuits: turn the question back to the user.
      const ask = result.toolCalls.find((call) => call.name === "ask_user_question");
      if (ask) {
        toolCalls.push({ name: ask.name, arguments: ask.arguments, ok: true });
        return { text: extractQuestion(ask.arguments), citations: [], toolCalls };
      }

      messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        const { content, ok } = await dispatch(handlers, call.name, call.arguments);
        toolCalls.push({ name: call.name, arguments: call.arguments, ok });
        messages.push({ role: "tool", toolCallId: call.id, content });
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
  readonly webSearch?: WebSearch;
  readonly docx?: DocxCompiler;
  readonly docxReader?: DocxReader;
  readonly cases?: CaseRepository;
  readonly blobs?: BlobStore;
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
  const webSearch = deps.webSearch;
  if (webSearch) {
    handlers.web_search = async (args) => {
      const { query } = WebSearchToolInput.parse(args);
      const response = await webSearch.search(query);
      return JSON.stringify({ answer: response.answer, results: response.results });
    };
  }
  const { docx, blobs, cases, docxReader } = deps;
  // write_docx: compile docx-js -> store the .docx -> attach an AI-drafted File to the case.
  if (docx && blobs && cases) {
    handlers.write_docx = async (args) => {
      const input = WriteDocxToolInput.parse(args);
      const cnr = asCnr(input.cnr);
      const caseRecord = await cases.get(cnr);
      if (!caseRecord) {
        throw new Error(`case ${input.cnr} has not been added`);
      }
      const bytes = await docx.compile(input.docxJsCode);
      const original = await blobs.put(bytes, DOCX_CONTENT_TYPE);
      const file: FileDocument = {
        id: newFileId(),
        cnr,
        original,
        pageImages: [],
        documentType: input.documentType,
        summary: input.summary,
        origin: "ai-drafted",
      };
      await cases.save({ ...caseRecord, files: [...caseRecord.files, file] });
      return JSON.stringify({
        status: "drafted",
        fileId: file.id,
        fileName: input.fileName,
        bytes: bytes.length,
      });
    };
  }
  // read_docx + read: resolve a stored artifact and return its real content.
  if (cases && blobs && docxReader) {
    handlers.read_docx = async (args) => {
      const { fileId } = ReadDocxToolInput.parse(args);
      const file = (await cases.list()).flatMap((c) => c.files).find((f) => f.id === fileId);
      if (!file) {
        return `No file ${fileId} found.`;
      }
      return docxReader.extractText(await blobs.get(file.original));
    };

    // read: go beyond the summary to the document's content. A .docx File yields its real text;
    // page-image content for other types / orders needs the renderer (deferred), so we return the
    // summary and say so rather than inventing pages.
    handlers.read = async (args) => {
      const input = ReadToolInput.parse(args);
      const cases_ = await cases.list();
      const pages = `pages ${input.startPage}-${input.endPage}`;
      if (input.target === "file") {
        const file = cases_.flatMap((c) => c.files).find((f) => f.id === input.fileId);
        if (!file) {
          return `No file ${input.fileId} found.`;
        }
        if (file.original.contentType === DOCX_CONTENT_TYPE) {
          const text = await docxReader.extractText(await blobs.get(file.original));
          return `File ${file.id} (${file.documentType}), ${pages} — full text follows (page ranges honoured once the renderer lands):\n${text}`;
        }
        return `File ${file.id} (${file.documentType}, ${file.original.contentType}) — page content needs the document renderer (pending). Summary: ${file.summary}`;
      }
      const order = cases_.flatMap((c) => c.orders).find((o) => o.id === input.orderId);
      if (!order) {
        return `No order ${input.orderId} found.`;
      }
      return `Order ${order.id}, ${pages} — page content needs the document renderer (pending). Summary: ${order.summary}`;
    };
  }
  return handlers;
}

async function dispatch(
  handlers: MunshiToolHandlers,
  name: string,
  rawArgs: string,
): Promise<{ content: string; ok: boolean }> {
  const handler = handlers[name as MunshiToolName];
  if (!handler) {
    return { content: `Tool "${name}" is not available yet.`, ok: false };
  }
  try {
    return { content: await handler(parseArgs(rawArgs)), ok: true };
  } catch (error) {
    return {
      content: `Tool "${name}" failed: ${error instanceof Error ? error.message : String(error)}`,
      ok: false,
    };
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
      const orders = c.orders
        .map((o) => `  - order ${o.id} (${o.pages} pages): ${o.summary}`)
        .join("\n");
      const files = c.files
        .map((f) => `  - file ${f.id} (${f.documentType}, ${f.pages} pages): ${f.summary}`)
        .join("\n");
      return [`CNR ${c.cnr} — ${c.court.court}`, orders, files].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

/** Collect what the Munshi may cite — CNRs, and Order/File ids mapped to their page counts. */
function buildCitationAuthority(miniDetails: readonly CaseMiniDetail[]): CitationAuthority {
  const cnrs = new Set<string>();
  const orderPages = new Map<string, number>();
  const filePages = new Map<string, number>();
  for (const detail of miniDetails) {
    cnrs.add(detail.cnr);
    for (const order of detail.orders) {
      orderPages.set(order.id, order.pages);
    }
    for (const file of detail.files) {
      filePages.set(file.id, file.pages);
    }
  }
  return { cnrs, orderPages, filePages };
}

/** Tell the model which citations were unverifiable and which sources it may use instead. */
function citationCorrectionPrompt(
  unknown: readonly CitationInput[],
  authority: CitationAuthority,
): string {
  const bad = unknown.map((c) => formatCitation(toCitation(c))).join(" ");
  const pages = (m: ReadonlyMap<string, number>) =>
    m.size > 0 ? [...m].map(([id, n]) => `${id} (${n} pages)`).join(", ") : "none";
  const cnrs = authority.cnrs.size > 0 ? [...authority.cnrs].join(", ") : "none";
  return [
    `These citations reference sources or pages that are not in the user's caseload: ${bad}.`,
    "Re-answer, citing only sources/pages that exist or removing any claim you cannot support.",
    `Available — CNRs: ${cnrs}; Orders: ${pages(authority.orderPages)}; Files: ${pages(authority.filePages)}.`,
  ].join(" ");
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
