import type { ZodType } from "zod";

/**
 * Parse a model's text output into a schema-validated object.
 *
 * Real models (Gemma via Ollama / vLLM) frequently wrap their JSON in a ```json
 * fenced block or surround it with prose, so a bare `JSON.parse` is brittle. This
 * tolerates both — preferring a fenced block, otherwise the outermost `{ … }` — then
 * validates with the given Zod schema. Throws a clear error (with a snippet of the raw
 * output) when no valid JSON object can be found; schema-validation errors propagate.
 */
export function parseModelJson<T>(text: string, schema: ZodType<T>): T {
  const candidate = extractJsonObject(text);
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Model did not return valid JSON (${reason}). Raw output: ${snippet(text)}`);
  }
  return schema.parse(value);
}

/** Pull the JSON object out of model text: prefer a fenced block, else the outermost `{ … }`. */
function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence?.[1] ?? trimmed).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start !== -1 && end > start ? body.slice(start, end + 1) : body;
}

function snippet(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 200 ? `${oneLine.slice(0, 200)}…` : oneLine;
}
