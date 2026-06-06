/**
 * The seam through which NowLez reaches its two Gemma models (ADR-0003, ADR-0009):
 * the **smaller** model for ingestion classification, the **larger** model for the
 * Munshi. Callers ask for "small" or "large" — they never hardcode a model id.
 *
 * Adapters live in @nowlez/model: a deterministic fake for tests, and an
 * env-driven OpenAI-compatible client for real endpoints. Keys are read from the
 * environment, never committed.
 */
import type { BinaryRef } from "./binary";

export type ModelRole = "system" | "user" | "assistant" | "tool";

/** A tool the model may call: a name, a description, and a JSON Schema for its input. */
export interface ModelToolDef {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

/** A tool call the model emitted. `arguments` is a JSON string. */
export interface ModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: string;
  /** Image inputs for vision models (used by the smaller ingestion model). */
  readonly images?: readonly BinaryRef[];
  /** Tool calls this assistant message requested. */
  readonly toolCalls?: readonly ModelToolCall[];
  /** For a "tool" message: the id of the tool call it answers. */
  readonly toolCallId?: string;
}

export interface ModelCompletionRequest {
  /** Which configured model to use — the small (ingestion) or large (Munshi) one. */
  readonly model: "small" | "large";
  readonly messages: readonly ModelMessage[];
  /** Tools the model may call. */
  readonly tools?: readonly ModelToolDef[];
  /** Ask the model to return a strict JSON object. */
  readonly responseFormat?: "text" | "json";
  readonly temperature?: number;
}

export interface ModelCompletionResult {
  readonly text: string;
  /** Tool calls the model requested, if any. */
  readonly toolCalls?: readonly ModelToolCall[];
}

export interface ModelClient {
  /** Which implementation this is (e.g. "fake", "openai-compatible"). */
  readonly id: string;
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
}
