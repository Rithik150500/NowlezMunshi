import { formatCitation, type ModelClient, toCitation } from "@nowlez/contracts";
import { Munshi } from "@nowlez/munshi";

/** Ask the Munshi a question and format its cited reply for the terminal. */
export async function askMunshi(model: ModelClient, question: string): Promise<string> {
  const munshi = new Munshi(model);
  const response = await munshi.run(question, munshi.assembleContext([]));
  const citations = response.citations.map((c) => formatCitation(toCitation(c))).join(" ");
  return citations ? `${response.text}\n\nCitations: ${citations}` : response.text;
}
