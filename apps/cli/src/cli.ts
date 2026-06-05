import type { CaseManagement } from "@nowlez/case-management";
import { asCnr, formatCitation, type ModelClient, toCitation } from "@nowlez/contracts";
import { Munshi, type MunshiToolHandlers } from "@nowlez/munshi";
import type { TrackingService } from "@nowlez/tracking";

/** Ask the Munshi a question and format its cited reply for the terminal. */
export async function askMunshi(
  model: ModelClient,
  question: string,
  handlers: MunshiToolHandlers = {},
): Promise<string> {
  const munshi = new Munshi(model);
  const response = await munshi.run(question, munshi.assembleContext([]), handlers);
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

// --- Case commands (against the configured source + durable store) ---

export async function addCase(cm: CaseManagement, cnr: string): Promise<string> {
  const added = await cm.addCaseByCnr(asCnr(cnr));
  return `Added ${added.cnr} — ${added.court.court} (${added.orders.length} order(s)); tracking: ${added.tracking}.`;
}

export async function listCases(cm: CaseManagement): Promise<string> {
  const cases = await cm.listCases();
  if (cases.length === 0) {
    return "No cases yet. Add one with: nowlez add-case <CNR>";
  }
  return cases
    .map(
      (c) =>
        `${c.cnr}  ${c.court.court}  (${c.orders.length} orders)${c.tracking ? "  [tracked]" : ""}`,
    )
    .join("\n");
}

export async function showCauseList(cm: CaseManagement, date: string): Promise<string> {
  const entries = await cm.getCauseListForUser(date);
  if (entries.length === 0) {
    return `No tracked cases listed for ${date}.`;
  }
  return entries.map((e) => `${e.date}  ${e.cnr ?? "?"}  ${e.parties ?? ""}`).join("\n");
}

export async function refreshTracked(tracking: TrackingService): Promise<string> {
  const results = await tracking.refreshAll();
  if (results.length === 0) {
    return "No tracked cases to refresh.";
  }
  const alerts = results.flatMap((r) => r.alerts);
  if (alerts.length === 0) {
    return `Refreshed ${results.length} case(s); no alerts.`;
  }
  return [
    `Refreshed ${results.length} case(s); ${alerts.length} alert(s):`,
    ...alerts.map((a) => `  • [${a.kind}] ${a.cnr}: ${a.message}`),
  ].join("\n");
}
