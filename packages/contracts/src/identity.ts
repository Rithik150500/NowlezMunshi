/**
 * Identity & tenancy (docs/auth.md, ADR-0019). The tenant is the advocate's **Firm** (a solo
 * advocate is a firm of one); a **User** belongs to one firm with a **Role**. This is the model
 * auth (ADR-0019) and per-tenant scoping build on. Auth credentials live on the User as optional
 * fields, so a user may sign in by phone OTP, email + password, and/or Google — see ./auth.ts.
 */
import type { FirmId, UserId } from "./brands";

/** A firm's role for a user; gates what they may do (RBAC, applied above this type). */
export type Role = "principal" | "associate" | "clerk";

/** The tenant — the advocate's firm. */
export interface Firm {
  readonly id: FirmId;
  readonly name: string;
}

/** A member of a firm. Auth credentials are optional (a user may use any of the methods). */
export interface User {
  readonly id: UserId;
  readonly firmId: FirmId;
  readonly name: string;
  readonly role: Role;
  /** Login identifiers — at least one is set, depending on how the user authenticates. */
  readonly email?: string;
  readonly phone?: string;
  /** A scrypt password hash (email + password login), when set. Never leaves the server. */
  readonly passwordHash?: string;
  /** The Google subject id (Google sign-in), when linked. */
  readonly googleSub?: string;
}

export interface UserRepository {
  save(value: User): Promise<void>;
  get(id: UserId): Promise<User | undefined>;
  findByEmail(email: string): Promise<User | undefined>;
  findByPhone(phone: string): Promise<User | undefined>;
  findByGoogleSub(sub: string): Promise<User | undefined>;
  list(): Promise<readonly User[]>;
}

export interface FirmRepository {
  save(value: Firm): Promise<void>;
  get(id: FirmId): Promise<Firm | undefined>;
  list(): Promise<readonly Firm[]>;
}
