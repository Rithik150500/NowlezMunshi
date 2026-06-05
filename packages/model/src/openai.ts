import type {
  ModelClient,
  ModelCompletionRequest,
  ModelCompletionResult,
  ModelMessage,
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

interface OpenAiChatResponse {
  readonly choices?: ReadonlyArray<{ readonly message?: { readonly content?: string } }>;
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
    return { text: json.choices?.[0]?.message?.content ?? "" };
  }
}

function toOpenAiMessage(message: ModelMessage): Record<string, unknown> {
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
