/**
 * Inline-citation discipline (docs/munshi.md#citation-discipline). The Munshi
 * must cite every claim to one of: a CNR, an Order ID + page, a File ID + page,
 * or a web URL. This module models that union and a runtime schema for it.
 */
import { z } from "zod";
import type { Cnr, FileId, OrderId } from "./brands";
import { asCnr, asFileId, asOrderId } from "./brands";

export type Citation =
  | { readonly kind: "cnr"; readonly cnr: Cnr }
  | { readonly kind: "order"; readonly orderId: OrderId; readonly page: number }
  | { readonly kind: "file"; readonly fileId: FileId; readonly page: number }
  | { readonly kind: "url"; readonly url: string };

/**
 * Validates the STRUCTURE of a citation the Munshi emits. Checking that the
 * referenced identifier — and, for orders/files, the cited page — actually
 * exists is done separately by `isKnownCitation` (below).
 */
export const CitationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cnr"), cnr: z.string().min(1) }),
  z.object({
    kind: z.literal("order"),
    orderId: z.string().min(1),
    page: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal("file"),
    fileId: z.string().min(1),
    page: z.number().int().positive(),
  }),
  z.object({ kind: z.literal("url"), url: z.url() }),
]);

export type CitationInput = z.infer<typeof CitationSchema>;

/** Render a citation as a compact inline tag, e.g. "[order:ABC#3]". */
export function formatCitation(c: Citation): string {
  switch (c.kind) {
    case "cnr":
      return `[cnr:${c.cnr}]`;
    case "order":
      return `[order:${c.orderId}#${c.page}]`;
    case "file":
      return `[file:${c.fileId}#${c.page}]`;
    case "url":
      return `[url:${c.url}]`;
  }
}

/** Turn a validated citation input into a branded Citation. */
export function toCitation(input: CitationInput): Citation {
  switch (input.kind) {
    case "cnr":
      return { kind: "cnr", cnr: asCnr(input.cnr) };
    case "order":
      return { kind: "order", orderId: asOrderId(input.orderId), page: input.page };
    case "file":
      return { kind: "file", fileId: asFileId(input.fileId), page: input.page };
    case "url":
      return { kind: "url", url: input.url };
  }
}

/**
 * What a citation may legitimately reference, drawn from the user's caseload: its
 * CNRs, and each Order/File id mapped to its page count (so a cited page can be
 * checked against how many pages the document actually has).
 */
export interface CitationAuthority {
  readonly cnrs: ReadonlySet<string>;
  readonly orderPages: ReadonlyMap<string, number>;
  readonly filePages: ReadonlyMap<string, number>;
}

/**
 * Whether a citation references a source that actually exists in the user's
 * caseload. URLs are always allowed (external); a CNR must be known; an Order/File
 * citation must name a known id AND a page that exists within it (1..pageCount).
 */
export function isKnownCitation(c: CitationInput, known: CitationAuthority): boolean {
  switch (c.kind) {
    case "url":
      return true;
    case "cnr":
      return known.cnrs.has(c.cnr);
    case "order":
      return pageExists(known.orderPages.get(c.orderId), c.page);
    case "file":
      return pageExists(known.filePages.get(c.fileId), c.page);
  }
}

/** A cited page exists when the id is known and the page is within its page count. */
function pageExists(pageCount: number | undefined, page: number): boolean {
  return pageCount !== undefined && page >= 1 && page <= pageCount;
}

/** The citations that reference unknown identifiers — i.e. hallucinated sources. */
export function unknownCitations(
  citations: readonly CitationInput[],
  known: CitationAuthority,
): readonly CitationInput[] {
  return citations.filter((c) => !isKnownCitation(c, known));
}
