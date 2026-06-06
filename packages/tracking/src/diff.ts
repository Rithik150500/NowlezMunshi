import type { AlertKind, Case, Cnr, OrderId } from "@nowlez/contracts";

/** A single change detected between two snapshots of a case. */
export interface CaseChange {
  readonly cnr: Cnr;
  readonly kind: AlertKind;
  /** Whether this change raises a notification (vs. a silent background update). */
  readonly alertWorthy: boolean;
  readonly summary: string;
  /** Present for "new-order" changes. */
  readonly orderId?: OrderId;
}

/**
 * The catalogue of watched case-detail changes and whether each raises a notification
 * (alerts-and-tracking.md). New orders are always alert-worthy (handled below). Of the detail
 * fields, a changed **next hearing date** or **status** (e.g. a disposal) is alert-worthy — these
 * are what an advocate must act on; other tracked fields update silently.
 */
const WATCHED_DETAIL_FIELDS = [
  { field: "nextHearingDate", label: "Next hearing", alertWorthy: true },
  { field: "status", label: "Status", alertWorthy: true },
  { field: "caseType", label: "Case type", alertWorthy: false },
  { field: "parties", label: "Parties", alertWorthy: false },
  { field: "filingDate", label: "Filing date", alertWorthy: false },
  { field: "registrationDate", label: "Registration date", alertWorthy: false },
] as const;

const show = (value: unknown): string => (value === undefined ? "—" : String(value));

/**
 * Diff two snapshots of a case. New orders and changes to the next-hearing date / status are
 * **alert-worthy**; other watched detail changes are recorded as **silent** updates.
 */
export function diffCase(previous: Case, latest: Case): readonly CaseChange[] {
  const changes: CaseChange[] = [];

  const knownOrderIds = new Set<string>(previous.orders.map((o) => o.id));
  for (const order of latest.orders) {
    if (!knownOrderIds.has(order.id)) {
      changes.push({
        cnr: latest.cnr,
        kind: "new-order",
        alertWorthy: true,
        summary: `New order ${order.id}`,
        orderId: order.id,
      });
    }
  }

  for (const { field, label, alertWorthy } of WATCHED_DETAIL_FIELDS) {
    const before = previous.details[field];
    const after = latest.details[field];
    if (before !== after) {
      changes.push({
        cnr: latest.cnr,
        kind: "case-update",
        alertWorthy,
        summary: `${label}: ${show(before)} -> ${show(after)}`,
      });
    }
  }

  return changes;
}
