/**
 * Parse an inbound WhatsApp text into a command (ADR-0013, interfaces.md#whatsapp). Recognised
 * commands cover the common case-lookup actions; anything else falls through to the Munshi.
 */
export type WhatsAppCommand =
  | { readonly kind: "help" }
  | { readonly kind: "case"; readonly cnr: string }
  | { readonly kind: "orders"; readonly cnr: string }
  | { readonly kind: "file"; readonly fileId: string }
  | { readonly kind: "cause-list"; readonly date: string }
  | { readonly kind: "hearings" }
  | { readonly kind: "briefing" }
  | { readonly kind: "munshi"; readonly text: string };

/** A 16-char eCourts CNR: 4 letters + 12 digits. */
const CNR_RE = /^[A-Za-z]{4}\d{12}$/;

export function parseWhatsAppCommand(text: string): WhatsAppCommand {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "help" || lower === "/help" || lower === "?") {
    return { kind: "help" };
  }
  if (lower === "hearings" || lower === "hearing" || lower === "upcoming") {
    return { kind: "hearings" };
  }
  if (lower === "briefing" || lower === "brief") {
    return { kind: "briefing" };
  }
  const caseMatch = /^(?:case|cnr)\s+(\S+)/i.exec(trimmed);
  if (caseMatch?.[1]) {
    return { kind: "case", cnr: caseMatch[1].toUpperCase() };
  }
  const ordersMatch = /^orders?\s+(\S+)/i.exec(trimmed);
  if (ordersMatch?.[1]) {
    return { kind: "orders", cnr: ordersMatch[1].toUpperCase() };
  }
  const fileMatch = /^file\s+(\S+)/i.exec(trimmed);
  if (fileMatch?.[1]) {
    return { kind: "file", fileId: fileMatch[1] };
  }
  const causeMatch = /^cause[-\s]?list\s+(\S+)/i.exec(trimmed);
  if (causeMatch?.[1]) {
    return { kind: "cause-list", date: causeMatch[1] };
  }
  // A bare CNR is shorthand for a case lookup.
  if (CNR_RE.test(trimmed)) {
    return { kind: "case", cnr: trimmed.toUpperCase() };
  }
  return { kind: "munshi", text: trimmed };
}
