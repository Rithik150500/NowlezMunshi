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

export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: string;
  /** Image inputs for vision models (used by the smaller ingestion model). */
  readonly images?: readonly BinaryRef[];
}

export interface ModelCompletionRequest {
  /** Which configured model to use — the small (ingestion) or large (Munshi) one. */
  readonly model: "small" | "large";
  readonly messages: readonly ModelMessage[];
  /** Ask the model to return a strict JSON object. */
  readonly responseFormat?: "text" | "json";
  readonly temperature?: number;
}

export interface ModelCompletionResult {
  readonly text: string;
}

export interface ModelClient {
  /** Which implementation this is (e.g. "fake", "openai-compatible"). */
  readonly id: string;
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
}
