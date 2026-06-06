/**
 * Authentication seams (docs/auth.md, ADR-0019). NowLez supports three sign-in methods behind one
 * `AuthService` ([`@nowlez/auth`](../../auth)): **phone OTP** (delivered over an `OtpSender` —
 * WhatsApp/SMS), **email + password** (hashed with Node's `scrypt`), and **Google sign-in** (a
 * `GoogleVerifier` checks the client-obtained ID token). Sessions are opaque tokens in a
 * `SessionStore`. Each external piece is a port with an offline fake, so CI stays green.
 */
import type { FirmId, UserId } from "./brands";
import type { Role } from "./identity";

/** Delivers a one-time passcode to a phone (over WhatsApp or SMS). */
export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

/** The identity a verified Google ID token yields. */
export interface GoogleIdentity {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
}

/** Verifies a Google ID token — the client completes the OAuth flow; the server verifies the token. */
export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

/** The authenticated principal carried on a request once its session is validated. */
export interface AuthPrincipal {
  readonly userId: UserId;
  readonly firmId: FirmId;
  readonly role: Role;
}

/** An issued session: an opaque token bound to a principal, with an expiry. */
export interface Session extends AuthPrincipal {
  readonly token: string;
  /** ISO 8601 expiry. */
  readonly expiresAt: string;
}

/** Persistence for issued sessions (opaque bearer tokens). */
export interface SessionStore {
  create(session: Session): Promise<void>;
  get(token: string): Promise<Session | undefined>;
  delete(token: string): Promise<boolean>;
}
