import { formatCitation, type ModelClient, toCitation } from "@nowlez/contracts";
import { Munshi } from "@nowlez/munshi";

/** Ask the Munshi a question and format its cited reply for the terminal. */
export async function askMunshi(model: ModelClient, question: string): Promise<string> {
  const munshi = new Munshi(model);
  const response = await munshi.run(question, munshi.assembleContext([]));
  const citations = response.citations.map((c) => formatCitation(toCitation(c))).join(" ");
  return citations ? `${response.text}\n\nCitations: ${citations}` : response.text;
}

export interface ModelCheckResult {
  readonly model: "small" | "large";
  readonly ok: boolean;
  readonly detail: string;
}

/** Probe both configured models with a trivial completion — a connectivity check. */
export async function checkModels(model: ModelClient): Promise<readonly ModelCheckResult[]> {
  const results: ModelCheckResult[] = [];
  for (const which of ["small", "large"] as const) {
    try {
      const reply = await model.complete({
        model: which,
        messages: [{ role: "user", content: "ping" }],
      });
      results.push({ model: which, ok: true, detail: `ok (${reply.text.length} chars)` });
    } catch (error) {
      results.push({
        model: which,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}
