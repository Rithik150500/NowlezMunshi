/**
 * Branded string identifiers. Branding keeps a CNR from being interchangeable
 * with an arbitrary string (or with an Order/File ID) at the type level — a
 * small guard that reflects the central role of the CNR (ADR-0001).
 *
 * @see ../../../docs/data-model.md
 * @see ../../../docs/decisions/0001-cnr-as-sole-primary-key.md
 */
import { randomUUID } from "node:crypto";

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Case Number Record — the sole primary key of a Case (ADR-0001). */
export type Cnr = Brand<string, "Cnr">;
export type OrderId = Brand<string, "OrderId">;
export type FileId = Brand<string, "FileId">;
export type UserId = Brand<string, "UserId">;
export type AlertId = Brand<string, "AlertId">;
/** A NowLez tenant — the advocate's firm (a solo advocate is a firm of one). */
export type FirmId = Brand<string, "FirmId">;
/** A NowLez-local client (the advocate's client). Not an eCourts identifier. */
export type ClientId = Brand<string, "ClientId">;
/** A NowLez-local deadline on a case (a limitation / filing due date). */
export type DeadlineId = Brand<string, "DeadlineId">;

/**
 * Smart constructor for a CNR. The exact CNR format / checksum is an open
 * question (open-questions.md#data-model); for now we only assert non-empty.
 */
export function asCnr(value: string): Cnr {
  if (value.trim().length === 0) {
    throw new Error("CNR must be a non-empty string.");
  }
  return value as Cnr;
}

export const asOrderId = (value: string): OrderId => value as OrderId;
export const asFileId = (value: string): FileId => value as FileId;
export const asUserId = (value: string): UserId => value as UserId;
export const asAlertId = (value: string): AlertId => value as AlertId;
export const asClientId = (value: string): ClientId => value as ClientId;
export const asDeadlineId = (value: string): DeadlineId => value as DeadlineId;
export const asFirmId = (value: string): FirmId => value as FirmId;

/** Generate a fresh, unique File ID (provisional scheme — open-questions.md#data-model). */
export const newFileId = (): FileId => randomUUID() as FileId;
/** Generate a fresh, unique Client ID. */
export const newClientId = (): ClientId => randomUUID() as ClientId;
/** Generate a fresh, unique Deadline ID. */
export const newDeadlineId = (): DeadlineId => randomUUID() as DeadlineId;
/** Generate a fresh, unique User ID. */
export const newUserId = (): UserId => randomUUID() as UserId;
/** Generate a fresh, unique Firm (tenant) ID. */
export const newFirmId = (): FirmId => randomUUID() as FirmId;
