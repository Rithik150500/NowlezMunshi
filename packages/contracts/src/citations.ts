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
 * referenced identifier actually exists is done separately by `isKnownCitation`
 * (below); page-range existence is still deferred (open-questions.md#munshi).
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
 * The identifiers a citation may legitimately reference, drawn from the user's
 * caseload — its CNRs and the IDs of its Orders and Files.
 */
export interface CitationAuthority {
  readonly cnrs: ReadonlySet<string>;
  readonly orderIds: ReadonlySet<string>;
  readonly fileIds: ReadonlySet<string>;
}

/**
 * Whether a citation references a source that actually exists in the user's
 * caseload. URLs are always allowed (external); cnr / order / file citations
 * must name a known identifier. Page-range checking needs page counts in the
 * Munshi's context and is deferred (open-questions.md#munshi).
 */
export function isKnownCitation(c: CitationInput, known: CitationAuthority): boolean {
  switch (c.kind) {
    case "url":
      return true;
    case "cnr":
      return known.cnrs.has(c.cnr);
    case "order":
      return known.orderIds.has(c.orderId);
    case "file":
      return known.fileIds.has(c.fileId);
  }
}

/** The citations that reference unknown identifiers — i.e. hallucinated sources. */
export function unknownCitations(
  citations: readonly CitationInput[],
  known: CitationAuthority,
): readonly CitationInput[] {
  return citations.filter((c) => !isKnownCitation(c, known));
}
