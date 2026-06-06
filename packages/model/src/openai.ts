import type {
  ModelClient,
  ModelCompletionRequest,
  ModelCompletionResult,
  ModelMessage,
  ModelToolCall,
} from "@nowlez/contracts";

export interface OpenAiCompatibleConfig {
  /** Base URL up to and including the version segment, e.g. "http://localhost:11434/v1". */
  readonly baseUrl: string;
  readonly apiKey?: string;
  /** Model id mapped from "small". */
  readonly smallModel: string;
  /** Model id mapped from "large". */
  readonly largeModel: string;
  /** Injectable fetch for testing; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
}

interface OpenAiResponseToolCall {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments: string };
}

interface OpenAiChatResponse {
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: ReadonlyArray<OpenAiResponseToolCall>;
    };
  }>;
}

/**
 * An OpenAI-compatible `/chat/completions` client. Works with self-hosted servers
 * (vLLM, Ollama, LM Studio) and hosted providers — including Gemini's
 * OpenAI-compatibility endpoint. Config is supplied by `selectModelClient` from
 * the environment.
 */
export class OpenAiCompatibleModelClient implements ModelClient {
  readonly id = "openai-compatible";

  constructor(private readonly config: OpenAiCompatibleConfig) {}

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    const model = request.model === "small" ? this.config.smallModel : this.config.largeModel;
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map(toOpenAiMessage),
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
    }
    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    const doFetch = this.config.fetchImpl ?? fetch;
    const response = await doFetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`ModelClient HTTP ${response.status}: ${await response.text()}`);
    }
    const json = (await response.json()) as OpenAiChatResponse;
    const message = json.choices?.[0]?.message;
    const toolCalls: ModelToolCall[] = (message?.tool_calls ?? []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    }));
    const text = message?.content ?? "";
    return toolCalls.length > 0 ? { text, toolCalls } : { text };
  }
}

function toOpenAiMessage(message: ModelMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: message.role,
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      })),
    };
  }
  if (message.images && message.images.length > 0) {
    return {
      role: message.role,
      content: [
        { type: "text", text: message.content },
        ...message.images.map((ref) => ({ type: "image_url", image_url: { url: ref.uri } })),
      ],
    };
  }
  return { role: message.role, content: message.content };
}
