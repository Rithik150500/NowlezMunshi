import { asCnr, type Case } from "@nowlez/contracts";
import { parseWhatsAppCommand } from "@nowlez/whatsapp";
import type { ServerEngine } from "./engine";

const HELP = [
  "NowLez on WhatsApp — try:",
  "• case <CNR> — case details",
  "• orders <CNR> — list a case's orders",
  "• cause-list <YYYY-MM-DD> — your listings that day",
  "• …anything else — ask the Munshi",
].join("\n");

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
 * Route an inbound WhatsApp text to a reply (ADR-0013): case / orders / cause-list lookups against
 * the engine, otherwise the Munshi. (PDF/media delivery needs the Meta media API and is a follow-up;
 * for now lookups reply as text.)
 */
export async function handleWhatsAppText(text: string, engine: ServerEngine): Promise<string> {
  const command = parseWhatsAppCommand(text);
  switch (command.kind) {
    case "help":
      return HELP;
    case "case": {
      const found = await engine.caseManagement.getCase(asCnr(command.cnr));
      return found ? formatCase(found) : `No case ${command.cnr} found. Add it in the app first.`;
    }
    case "orders": {
      const found = await engine.caseManagement.getCase(asCnr(command.cnr));
      if (!found) {
        return `No case ${command.cnr} found.`;
      }
      if (found.orders.length === 0) {
        return `No orders for ${command.cnr} yet.`;
      }
      return [
        `Orders for ${command.cnr}:`,
        ...found.orders.map((o) => `• ${o.id}: ${o.summary || "(not yet summarised)"}`),
      ].join("\n");
    }
    case "cause-list": {
      const entries = await engine.caseManagement.getCauseListForUser(command.date);
      if (entries.length === 0) {
        return `Nothing listed for ${command.date}.`;
      }
      return [
        `Cause list ${command.date}:`,
        ...entries.map((e) => `• ${e.cnr ?? e.caseNumber ?? "—"} ${e.parties ?? ""}`.trimEnd()),
      ].join("\n");
    }
    case "munshi": {
      const context = engine.munshi.assembleContext(await engine.caseManagement.listMiniDetails());
      const reply = await engine.munshi.run(command.text, context, engine.handlers);
      return reply.text;
    }
  }
}
