/**
 * The NowLez data model (docs/data-model.md). A Case is the central entity,
 * keyed solely by its CNR (ADR-0001); it owns Orders and Files, and is
 * summarised compactly as a CaseMiniDetail for the Munshi's context.
 *
 * These are conceptual domain types. Concrete column types, nullability,
 * indexing, and persistence are open questions (open-questions.md#data-model).
 */
import type { BinaryRef } from "./binary";
import type { AlertId, Cnr, FileId, OrderId, UserId } from "./brands";

/** The selector path that located a case: State/HC -> District/Bench -> Court. */
export interface CourtHierarchy {
  readonly stateOrHighCourt: string;
  readonly districtOrBench: string;
  readonly court: string;
}

/**
 * The case's details as obtained from eCourts. The precise shape is an open
 * question (open-questions.md#data-model); these are the commonly-present
 * fields, and the index signature keeps the record faithful without inventing
 * a rigid schema.
 */
export interface CaseDetails {
  readonly parties?: string;
  readonly caseType?: string;
  readonly caseNumber?: string;
  readonly year?: number;
  readonly filingDate?: string;
  readonly registrationDate?: string;
  readonly status?: string;
  readonly nextHearingDate?: string;
  readonly [key: string]: unknown;
}

/** The central entity. Keyed solely by its CNR (ADR-0001). */
export interface Case {
  readonly cnr: Cnr;
  readonly court: CourtHierarchy;
  readonly details: CaseDetails;
  /** Whether the case is tracked for the daily refresh (alerts-and-tracking.md). */
  readonly tracking: boolean;
  readonly orders: readonly Order[];
  readonly files: readonly FileDocument[];
}

/** A court order belonging to a Case, identified by an Order ID. */
export interface Order {
  readonly id: OrderId;
  readonly cnr: Cnr;
  readonly sourcePdf: BinaryRef;
  /** Page images derived from the source PDF during ingestion. */
  readonly pageImages: readonly BinaryRef[];
  /** Order summary (the metadata) produced at ingestion. */
  readonly summary: string;
}

export type FileOrigin = "user-uploaded" | "ai-drafted";

/**
 * The domain "File" entity. Named `FileDocument` to avoid clashing with the
 * global `File`. Belongs to a Case; identified by a File ID.
 */
export interface FileDocument {
  readonly id: FileId;
  readonly cnr: Cnr;
  /** The original upload or generated document (doc/docx, PDF, or image). */
  readonly original: BinaryRef;
  readonly pageImages: readonly BinaryRef[];
  /** Document type determined at ingestion. */
  readonly documentType: string;
  /** Descriptive file summary produced at ingestion. */
  readonly summary: string;
  readonly origin: FileOrigin;
}

/**
 * The compact representation of a case loaded into the Munshi's context: its
 * order and file summaries (with their IDs, so the Munshi can both cite them
 * and `read` their real pages). Lets the Munshi reason across the whole
 * caseload without holding every full document.
 */
export interface CaseMiniDetail {
  readonly cnr: Cnr;
  readonly court: CourtHierarchy;
  readonly orders: readonly {
    readonly id: OrderId;
    readonly pages: number;
    readonly summary: string;
  }[];
  readonly files: readonly {
    readonly id: FileId;
    readonly pages: number;
    readonly documentType: string;
    readonly summary: string;
  }[];
}

/**
 * Owns cases, receives alerts, interacts via the three front-ends. The auth /
 * accounts / tenancy model is an open question (open-questions.md#data-model).
 */
export interface User {
  readonly id: UserId;
}

export type AlertKind = "new-order" | "case-update";

/**
 * A notification raised by an alert-worthy change. The spec commits only to
 * "new orders are alert-worthy"; the full catalogue of alert-worthy vs.
 * routine/cosmetic changes is an open question (open-questions.md#alerts--tracking).
 */
export interface Alert {
  readonly id: AlertId;
  readonly cnr: Cnr;
  readonly kind: AlertKind;
  readonly message: string;
  /** ISO 8601 timestamp. */
  readonly createdAt: string;
  readonly read: boolean;
}

/**
 * Derive the compact mini-detail — the case's order and file summaries (with
 * their IDs) — that gets loaded into the Munshi's context.
 */
export function toMiniDetail(value: Case): CaseMiniDetail {
  return {
    cnr: value.cnr,
    court: value.court,
    orders: value.orders.map((o) => ({
      id: o.id,
      pages: o.pageImages.length,
      summary: o.summary,
    })),
    files: value.files.map((f) => ({
      id: f.id,
      pages: f.pageImages.length,
      documentType: f.documentType,
      summary: f.summary,
    })),
  };
}
