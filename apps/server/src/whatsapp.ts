import { asCnr, type Case, type OutboundDocument } from "@nowlez/contracts";
import {
  buildDailyBriefing,
  buildHearingDigest,
  formatDailyBriefing,
  type HearingBucket,
  type HearingDigest,
} from "@nowlez/tracking";
import { parseWhatsAppCommand } from "@nowlez/whatsapp";
import type { ServerEngine } from "./engine";

const HELP = [
  "NowLez on WhatsApp — try:",
  "• case <CNR> — case details",
  "• orders <CNR> — list a case's orders",
  "• file <FileID> — get a stored document",
  "• cause-list <YYYY-MM-DD> — your listings that day",
  "• hearings — your upcoming hearings",
  "• briefing — your day at a glance",
  "• …anything else — ask the Munshi",
].join("\n");

const HEARING_LABELS: Record<HearingBucket, string> = {
  overdue: "⚠ Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  thisWeek: "This week",
  later: "Later",
  unscheduled: "Unscheduled",
};

/** Render the hearing digest for chat: the actionable buckets in full, the rest summarised. */
function formatHearings(digest: HearingDigest): string {
  if (digest.entries.length === 0) {
    return "No upcoming hearings in your tracked cases.";
  }
  const lines = [`Upcoming hearings (as of ${digest.today}):`];
  for (const bucket of ["overdue", "today", "tomorrow", "thisWeek"] as const) {
    const entries = digest.entries.filter((e) => e.bucket === bucket);
    if (entries.length === 0) {
      continue;
    }
    lines.push(`${HEARING_LABELS[bucket]}:`);
    for (const e of entries) {
      lines.push(`• ${e.cnr}${e.date ? ` (${e.date})` : ""} ${e.parties ?? ""}`.trimEnd());
    }
  }
  const tail: string[] = [];
  if (digest.counts.later > 0) {
    tail.push(`${digest.counts.later} later`);
  }
  if (digest.counts.unscheduled > 0) {
    tail.push(`${digest.counts.unscheduled} unscheduled`);
  }
  if (tail.length > 0) {
    lines.push(`(+${tail.join(", ")})`);
  }
  return lines.join("\n");
}

const EXT: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/pdf": ".pdf",
};

/** Reply with either text or a document to send as WhatsApp media. */
export type WhatsAppReply =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "document"; readonly document: OutboundDocument };

const reply = (text: string): WhatsAppReply => ({ kind: "text", text });

function formatCase(c: Case): string {
  const d = c.details;
  return [
    `${c.cnr} — ${c.court.court}`,
    d.parties ? `Parties: ${d.parties}` : "",
    d.status ? `Status: ${d.status}` : "",
    d.nextHearingDate ? `Next hearing: ${d.nextHearingDate}` : "",
    `Orders: ${c.orders.length} · Files: ${c.files.length}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Route an inbound WhatsApp text to a reply (ADR-0013): case / orders / file / cause-list lookups
 * against the engine, otherwise the Munshi. A `file` command returns the stored document as media;
 * order / cause-list PDFs (which need rendering) remain text for now.
 */
export async function handleWhatsAppText(
  text: string,
  engine: ServerEngine,
): Promise<WhatsAppReply> {
  const command = parseWhatsAppCommand(text);
  switch (command.kind) {
    case "help":
      return reply(HELP);
    case "case": {
      const found = await engine.caseManagement.getCase(asCnr(command.cnr));
      return reply(
        found ? formatCase(found) : `No case ${command.cnr} found. Add it in the app first.`,
      );
    }
    case "orders": {
      const found = await engine.caseManagement.getCase(asCnr(command.cnr));
      if (!found) {
        return reply(`No case ${command.cnr} found.`);
      }
      if (found.orders.length === 0) {
        return reply(`No orders for ${command.cnr} yet.`);
      }
      return reply(
        [
          `Orders for ${command.cnr}:`,
          ...found.orders.map((o) => `• ${o.id}: ${o.summary || "(not yet summarised)"}`),
        ].join("\n"),
      );
    }
    case "file": {
      const file = await engine.caseManagement.findFile(command.fileId);
      if (!file) {
        return reply(`No file ${command.fileId} found.`);
      }
      const bytes = await engine.blobs.get(file.original);
      const filename = `${file.documentType}${EXT[file.original.contentType] ?? ""}`;
      return {
        kind: "document",
        document: {
          filename,
          contentType: file.original.contentType,
          bytes,
          caption: file.summary,
        },
      };
    }
    case "cause-list": {
      const entries = await engine.caseManagement.getCauseListForUser(command.date);
      if (entries.length === 0) {
        return reply(`Nothing listed for ${command.date}.`);
      }
      return reply(
        [
          `Cause list ${command.date}:`,
          ...entries.map((e) => `• ${e.cnr ?? e.caseNumber ?? "—"} ${e.parties ?? ""}`.trimEnd()),
        ].join("\n"),
      );
    }
    case "hearings":
      return reply(formatHearings(buildHearingDigest(await engine.caseManagement.listCases())));
    case "briefing": {
      const digest = buildHearingDigest(await engine.caseManagement.listCases());
      return reply(formatDailyBriefing(buildDailyBriefing(digest, await engine.alerts.list())));
    }
    case "munshi": {
      const context = engine.munshi.assembleContext(await engine.caseManagement.listMiniDetails());
      const answer = await engine.munshi.run(command.text, context, engine.handlers);
      return reply(answer.text);
    }
  }
}
