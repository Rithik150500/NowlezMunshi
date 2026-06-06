import type { ModelClient } from "@nowlez/contracts";
import { FakeModelClient } from "./fake";
import { type OpenAiCompatibleConfig, OpenAiCompatibleModelClient } from "./openai";

export type ModelClientKind = "fake" | "openai-compatible";

/**
 * Select a ModelClient (ADR-0009). The deterministic fake is the default (so
 * tests and CI never touch a network); "openai-compatible" reads its endpoint and
 * model ids from the environment.
 */
export function selectModelClient(kind: ModelClientKind = "fake"): ModelClient {
  switch (kind) {
    case "fake":
      return new FakeModelClient();
    case "openai-compatible":
      return new OpenAiCompatibleModelClient(configFromEnv());
    default:
      return assertNever(kind);
  }
}

function configFromEnv(): OpenAiCompatibleConfig {
  const baseUrl = process.env.NOWLEZ_MODEL_BASE_URL;
  const smallModel = process.env.NOWLEZ_MODEL_SMALL;
  const largeModel = process.env.NOWLEZ_MODEL_LARGE;
  if (!baseUrl || !smallModel || !largeModel) {
    throw new Error(
      "openai-compatible model client requires NOWLEZ_MODEL_BASE_URL, NOWLEZ_MODEL_SMALL, and NOWLEZ_MODEL_LARGE",
    );
  }
  return { baseUrl, smallModel, largeModel, apiKey: process.env.NOWLEZ_MODEL_API_KEY };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled model client kind: ${String(x)}`);
}
