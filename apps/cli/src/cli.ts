import type { CaseManagement, ClientService, DeadlineService } from "@nowlez/case-management";
import {
  type AlertStore,
  asClientId,
  asCnr,
  type CaseMiniDetail,
  formatCitation,
  type ModelClient,
  toCitation,
} from "@nowlez/contracts";
import { Munshi, type MunshiToolHandlers } from "@nowlez/munshi";
import {
  buildClientUpdate,
  buildDailyBriefing,
  buildDeadlineDigest,
  buildHearingDigest,
  formatClientUpdate,
  formatDailyBriefing,
  type HearingBucket,
  type TrackingService,
} from "@nowlez/tracking";

/** Ask the Munshi a question (over the user's case mini-details) and format its cited reply. */
export async function askMunshi(
  model: ModelClient,
  question: string,
  handlers: MunshiToolHandlers = {},
  miniDetails: readonly CaseMiniDetail[] = [],
): Promise<string> {
  const munshi = new Munshi(model);
  const response = await munshi.run(question, munshi.assembleContext(miniDetails), handlers);
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

const BUCKET_TAG: Record<HearingBucket, string> = {
  overdue: "OVERDUE",
  today: "TODAY",
  tomorrow: "TOMORROW",
  thisWeek: "this week",
  later: "later",
  unscheduled: "unscheduled",
};

/** The upcoming-hearings digest for the terminal (the user's tracked, active cases). */
export async function showHearings(cm: CaseManagement): Promise<string> {
  const digest = buildHearingDigest(await cm.listCases());
  if (digest.entries.length === 0) {
    return "No upcoming hearings in your tracked cases.";
  }
  return [
    `Hearings (as of ${digest.today}):`,
    ...digest.entries.map((e) =>
      `  [${BUCKET_TAG[e.bucket]}] ${e.cnr}  ${e.date ?? "date unknown"}  ${e.parties ?? ""}`.trimEnd(),
    ),
  ].join("\n");
}

/** The daily briefing for the terminal: imminent hearings + unread alerts. */
export async function showBriefing(cm: CaseManagement, alertStore: AlertStore): Promise<string> {
  const digest = buildHearingDigest(await cm.listCases());
  return formatDailyBriefing(buildDailyBriefing(digest, await alertStore.list()));
}

/** List the advocate's clients. */
export async function listClientsCli(clients: ClientService): Promise<string> {
  const all = await clients.listClients();
  if (all.length === 0) {
    return "No clients yet. Add one with: nowlez add-client <name> [phone]";
  }
  return all.map((c) => `${c.id}  ${c.name}${c.phone ? `  ${c.phone}` : ""}`).join("\n");
}

/** Create a client. */
export async function addClientCli(
  clients: ClientService,
  name: string,
  phone?: string,
): Promise<string> {
  const created = await clients.createClient({ name, phone });
  return `Added client ${created.name} (${created.id}).`;
}

/** Assign a case to a client. */
export async function assignClientCli(
  clients: ClientService,
  cnr: string,
  clientId: string,
): Promise<string> {
  await clients.assignCase(asCnr(cnr), asClientId(clientId));
  return `Assigned ${cnr} to client ${clientId}.`;
}

/** Compose a client's update (near-term hearings + recent alerts) for the advocate to review/send. */
export async function clientUpdateCli(
  clients: ClientService,
  alertStore: AlertStore,
  clientId: string,
): Promise<string> {
  const client = await clients.getClient(asClientId(clientId));
  if (!client) {
    return `No client ${clientId}.`;
  }
  const cases = await clients.listClientCases(client.id);
  return formatClientUpdate(buildClientUpdate(client, cases, await alertStore.list()));
}

const DEADLINE_TAG: Record<string, string> = {
  overdue: "OVERDUE",
  today: "TODAY",
  tomorrow: "TOMORROW",
  thisWeek: "soon",
  later: "later",
};

/** The upcoming-deadlines digest for the terminal (pending deadlines across the caseload). */
export async function showDeadlines(deadlines: DeadlineService): Promise<string> {
  const digest = buildDeadlineDigest(await deadlines.list());
  if (digest.entries.length === 0) {
    return "No upcoming deadlines.";
  }
  return [
    `Deadlines (as of ${digest.today}):`,
    ...digest.entries.map(
      (e) =>
        `  [${DEADLINE_TAG[e.bucket]}] ${e.deadline.dueDate}  ${e.deadline.title}  (${e.deadline.cnr})`,
    ),
  ].join("\n");
}

/** Add a deadline to a case (an explicit due date). */
export async function addDeadlineCli(
  deadlines: DeadlineService,
  cnr: string,
  dueDate: string,
  title: string,
): Promise<string> {
  const created = await deadlines.create({ cnr, title, dueDate });
  return `Added deadline "${created.title}" due ${created.dueDate} for ${cnr}.`;
}

export async function refreshTracked(
  tracking: TrackingService,
  alertStore: AlertStore,
): Promise<string> {
  const results = await tracking.refreshAll();
  if (results.length === 0) {
    return "No tracked cases to refresh.";
  }
  const added = await alertStore.save(results.flatMap((r) => r.alerts));
  if (added.length === 0) {
    return `Refreshed ${results.length} case(s); no new alerts.`;
  }
  return [
    `Refreshed ${results.length} case(s); ${added.length} new alert(s):`,
    ...added.map((a) => `  • [${a.kind}] ${a.cnr}: ${a.message}`),
  ].join("\n");
}

/** List persisted alerts (newest first) for the terminal. */
export async function listAlerts(alertStore: AlertStore): Promise<string> {
  const all = await alertStore.list();
  if (all.length === 0) {
    return "No alerts.";
  }
  return all
    .map((a) => `${a.read ? "· " : "• "}[${a.kind}] ${a.cnr}: ${a.message}  (${a.createdAt})`)
    .join("\n");
}
