/**
 * @nowlez/model — ModelClient adapters (ADR-0009). A deterministic fake backs dev
 * and tests; the env-driven OpenAI-compatible client reaches real Gemma endpoints
 * (self-host or hosted). Keys come from the environment, never committed.
 */
export { FakeModelClient, type FakeResponder } from "./fake";
export { type OpenAiCompatibleConfig, OpenAiCompatibleModelClient } from "./openai";
export { type ModelClientKind, selectModelClient } from "./select";
