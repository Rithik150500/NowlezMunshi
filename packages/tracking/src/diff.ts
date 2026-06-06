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
 * Case-detail fields the refresh watches for silent updates. The full catalogue
 * of alert-worthy vs. routine changes is an open question
 * (open-questions.md#alerts--tracking); the spec commits only to "new orders are
 * alert-worthy", which is what `diffCase` treats as alert-worthy below.
 */
const WATCHED_DETAIL_FIELDS = ["status", "nextHearingDate"] as const;

const show = (value: unknown): string => (value === undefined ? "—" : String(value));

/**
 * Diff two snapshots of a case. New orders are **alert-worthy**; changes to the
 * watched detail fields are recorded as **silent** updates.
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

  for (const field of WATCHED_DETAIL_FIELDS) {
    const before = previous.details[field];
    const after = latest.details[field];
    if (before !== after) {
      changes.push({
        cnr: latest.cnr,
        kind: "case-update",
        alertWorthy: false,
        summary: `${field}: ${show(before)} -> ${show(after)}`,
      });
    }
  }

  return changes;
}
