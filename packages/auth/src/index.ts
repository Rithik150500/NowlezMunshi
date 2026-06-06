/**
 * @nowlez/auth — authentication & identity (docs/auth.md, ADR-0019). One `AuthService` exposes the
 * three sign-in methods over ports: **phone OTP** (an `OtpSender`), **email + password** (Node
 * `scrypt`), and **Google sign-in** (a `GoogleVerifier`). Sessions are opaque bearer tokens in a
 * `SessionStore`. The external pieces are ports with offline fakes here, so CI stays green; the
 * real OTP sender (WhatsApp/SMS) and Google verifier wire at the composition root.
 */
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import {
  type AuthPrincipal,
  type Firm,
  type FirmRepository,
  type GoogleIdentity,
  type GoogleVerifier,
  newFirmId,
  newUserId,
  type OtpSender,
  type Session,
  type SessionStore,
  type User,
  type UserRepository,
} from "@nowlez/contracts";

const scrypt = promisify(scryptCb);
const SCRYPT_KEYLEN = 64;

/** Hash a password with scrypt: `scrypt$<salt-hex>$<hash-hex>` (no native dependency). */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(plain, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Verify a password against a `hashPassword` string, in constant time. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }
  const derived = (await scrypt(plain, Buffer.from(saltHex, "hex"), SCRYPT_KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Records sent OTPs instead of delivering them (tests / dev). */
export class FakeOtpSender implements OtpSender {
  readonly sent: { readonly to: string; readonly code: string }[] = [];
  async send(phone: string, code: string): Promise<void> {
    this.sent.push({ to: phone, code });
  }
}

/** Test/dev Google verifier: the "ID token" is the identity JSON itself (`{ sub, email, name }`). */
export class FakeGoogleVerifier implements GoogleVerifier {
  async verify(idToken: string): Promise<GoogleIdentity> {
    try {
      const parsed = JSON.parse(idToken) as Partial<GoogleIdentity>;
      if (!parsed.sub) {
        throw new Error("missing sub");
      }
      return { sub: parsed.sub, email: parsed.email, name: parsed.name };
    } catch {
      throw new Error("invalid Google token");
    }
  }
}

export interface AuthDeps {
  readonly users: UserRepository;
  readonly firms: FirmRepository;
  readonly sessions: SessionStore;
  readonly otp: OtpSender;
  readonly google: GoogleVerifier;
  readonly now?: () => Date;
  readonly sessionTtlMs?: number;
  readonly otpTtlMs?: number;
  /** Test seam for the OTP code (default: a random 6-digit code). */
  readonly generateOtp?: () => string;
}

export interface RegisterInput {
  readonly firmName: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly password?: string;
}

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEFAULT_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * The authentication service. Registration creates a firm + its principal user (the signup path);
 * the three login methods authenticate an existing user and issue a session. Per-user roles and
 * per-tenant query scoping build on the principal this returns (ADR-0019).
 */
export class AuthService {
  private readonly now: () => Date;
  private readonly sessionTtlMs: number;
  private readonly otpTtlMs: number;
  private readonly generateOtp: () => string;
  private readonly pendingOtps = new Map<string, { code: string; expiresAt: number }>();

  constructor(private readonly deps: AuthDeps) {
    this.now = deps.now ?? (() => new Date());
    this.sessionTtlMs = deps.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.otpTtlMs = deps.otpTtlMs ?? DEFAULT_OTP_TTL_MS;
    this.generateOtp = deps.generateOtp ?? (() => String(randomInt(0, 1_000_000)).padStart(6, "0"));
  }

  /** Register a new firm and its principal user (signup). Returns the issued session. */
  async registerFirm(input: RegisterInput): Promise<{ firm: Firm; user: User; session: Session }> {
    const firmName = input.firmName.trim();
    const name = input.name.trim();
    if (!firmName || !name) {
      throw new Error("A firm name and your name are required.");
    }
    if (!input.email && !input.phone) {
      throw new Error("An email or phone is required to sign in.");
    }
    if (input.email && (await this.deps.users.findByEmail(input.email))) {
      throw new Error("That email is already registered.");
    }
    if (input.phone && (await this.deps.users.findByPhone(input.phone))) {
      throw new Error("That phone is already registered.");
    }
    const firm: Firm = { id: newFirmId(), name: firmName };
    await this.deps.firms.save(firm);
    const user: User = {
      id: newUserId(),
      firmId: firm.id,
      name,
      role: "principal",
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    };
    await this.deps.users.save(user);
    return { firm, user, session: await this.issue(user) };
  }

  /** Request an OTP for a registered phone (delivered via the OtpSender). Silent if unknown. */
  async requestOtp(phone: string): Promise<void> {
    const user = await this.deps.users.findByPhone(phone);
    if (!user) {
      // Don't reveal whether the phone is registered; simply send nothing.
      return;
    }
    const code = this.generateOtp();
    this.pendingOtps.set(phone, { code, expiresAt: this.now().getTime() + this.otpTtlMs });
    await this.deps.otp.send(phone, code);
  }

  async verifyOtp(phone: string, code: string): Promise<Session> {
    const pending = this.pendingOtps.get(phone);
    if (!pending || pending.expiresAt < this.now().getTime() || pending.code !== code) {
      throw new Error("Invalid or expired code.");
    }
    this.pendingOtps.delete(phone);
    const user = await this.deps.users.findByPhone(phone);
    if (!user) {
      throw new Error("No account for that phone.");
    }
    return this.issue(user);
  }

  async loginWithPassword(email: string, password: string): Promise<Session> {
    const user = await this.deps.users.findByEmail(email);
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new Error("Invalid email or password.");
    }
    return this.issue(user);
  }

  async loginWithGoogle(idToken: string): Promise<Session> {
    const identity = await this.deps.google.verify(idToken);
    let user = await this.deps.users.findByGoogleSub(identity.sub);
    if (!user && identity.email) {
      // Link Google to an existing account matched by email.
      const byEmail = await this.deps.users.findByEmail(identity.email);
      if (byEmail) {
        user = { ...byEmail, googleSub: identity.sub };
        await this.deps.users.save(user);
      }
    }
    if (!user) {
      throw new Error("No account linked to that Google sign-in.");
    }
    return this.issue(user);
  }

  /** Validate a bearer token, returning the principal (or undefined if invalid/expired). */
  async validate(token: string): Promise<AuthPrincipal | undefined> {
    const session = await this.deps.sessions.get(token);
    if (!session) {
      return undefined;
    }
    if (Date.parse(session.expiresAt) < this.now().getTime()) {
      await this.deps.sessions.delete(token);
      return undefined;
    }
    return { userId: session.userId, firmId: session.firmId, role: session.role };
  }

  async logout(token: string): Promise<void> {
    await this.deps.sessions.delete(token);
  }

  private async issue(user: User): Promise<Session> {
    const session: Session = {
      token: randomBytes(24).toString("hex"),
      userId: user.id,
      firmId: user.firmId,
      role: user.role,
      expiresAt: new Date(this.now().getTime() + this.sessionTtlMs).toISOString(),
    };
    await this.deps.sessions.create(session);
    return session;
  }
}
