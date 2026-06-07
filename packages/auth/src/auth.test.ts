import {
  InMemoryFirmRepository,
  InMemorySessionStore,
  InMemoryUserRepository,
} from "@nowlez/persistence";
import { describe, expect, it } from "vitest";
import {
  type AuthDeps,
  AuthService,
  FakeGoogleVerifier,
  FakeOtpSender,
  hashPassword,
  verifyPassword,
} from "./index";

function build(overrides: Partial<AuthDeps> = {}) {
  const otp = new FakeOtpSender();
  const deps: AuthDeps = {
    users: new InMemoryUserRepository(),
    firms: new InMemoryFirmRepository(),
    sessions: new InMemorySessionStore(),
    otp,
    google: new FakeGoogleVerifier(),
    generateOtp: () => "123456",
    ...overrides,
  };
  return { auth: new AuthService(deps), otp };
}

describe("password hashing", () => {
  it("hashes and verifies; rejects wrong passwords and malformed hashes", async () => {
    const hash = await hashPassword("s3cret");
    expect(await verifyPassword("s3cret", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("AuthService", () => {
  it("registers a firm + principal and issues a valid session", async () => {
    const { auth } = build();
    const { firm, user, session } = await auth.registerFirm({
      firmName: "Asha & Co",
      name: "Asha",
      email: "asha@x.in",
      password: "pw",
    });
    expect(firm.name).toBe("Asha & Co");
    expect(user.role).toBe("principal");
    expect(user.firmId).toBe(firm.id);
    expect(await auth.validate(session.token)).toMatchObject({
      userId: user.id,
      firmId: firm.id,
      role: "principal",
    });
  });

  it("logs in with email + password (and rejects a bad password)", async () => {
    const { auth } = build();
    await auth.registerFirm({ firmName: "F", name: "A", email: "a@x.in", password: "pw" });
    expect((await auth.loginWithPassword("a@x.in", "pw")).token).toBeTruthy();
    await expect(auth.loginWithPassword("a@x.in", "bad")).rejects.toThrow();
  });

  it("logs in with phone OTP (only the right, unexpired code works)", async () => {
    const { auth, otp } = build();
    await auth.registerFirm({ firmName: "F", name: "A", phone: "919812345678" });
    await auth.requestOtp("919812345678");
    expect(otp.sent[0]).toEqual({ to: "919812345678", code: "123456" });
    await expect(auth.verifyOtp("919812345678", "000000")).rejects.toThrow();
    expect((await auth.verifyOtp("919812345678", "123456")).token).toBeTruthy();
  });

  it("sends no OTP for an unknown phone (no enumeration)", async () => {
    const { auth, otp } = build();
    await auth.requestOtp("910000000000");
    expect(otp.sent).toHaveLength(0);
  });

  it("logs in with Google, linking to an existing account by email", async () => {
    const { auth } = build();
    await auth.registerFirm({ firmName: "F", name: "A", email: "a@x.in", password: "pw" });
    expect(
      (await auth.loginWithGoogle(JSON.stringify({ sub: "g1", email: "a@x.in" }))).token,
    ).toBeTruthy();
    // Linked by sub now — a sub-only token also works.
    expect((await auth.loginWithGoogle(JSON.stringify({ sub: "g1" }))).token).toBeTruthy();
    // No account for an unknown identity.
    await expect(
      auth.loginWithGoogle(JSON.stringify({ sub: "nope", email: "no@x.in" })),
    ).rejects.toThrow();
  });

  it("validates, revokes, and expires sessions", async () => {
    let now = new Date("2026-06-01T00:00:00Z");
    const { auth } = build({ now: () => now, sessionTtlMs: 1000 });
    const { session } = await auth.registerFirm({ firmName: "F", name: "A", phone: "9111" });
    expect(await auth.validate(session.token)).toBeDefined();
    await auth.logout(session.token);
    expect(await auth.validate(session.token)).toBeUndefined();
    expect(await auth.validate("garbage")).toBeUndefined();

    const { session: s2 } = await auth.registerFirm({ firmName: "F2", name: "B", phone: "9222" });
    expect(await auth.validate(s2.token)).toBeDefined();
    now = new Date("2026-06-01T00:00:02Z"); // +2s, past the 1s TTL
    expect(await auth.validate(s2.token)).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("throttles repeated OTP requests for a phone, then allows again after the window", async () => {
    let now = 0;
    const { auth, otp } = build({
      now: () => new Date(now),
      otpRateLimit: { max: 2, windowMs: 1000 },
    });
    await auth.registerFirm({ firmName: "F", name: "A", phone: "9111" });

    await auth.requestOtp("9111");
    await auth.requestOtp("9111");
    await expect(auth.requestOtp("9111")).rejects.toThrow(/too many/i);
    expect(otp.sent).toHaveLength(2); // the throttled third was never sent

    now = 1001; // the window slides past the earlier hits
    await auth.requestOtp("9111");
    expect(otp.sent).toHaveLength(3);
  });

  it("throttles repeated failed password sign-ins; a success clears the count", async () => {
    let now = 0;
    const { auth } = build({
      now: () => new Date(now),
      loginRateLimit: { max: 2, windowMs: 1000 },
    });
    await auth.registerFirm({ firmName: "F", name: "A", email: "a@x.in", password: "pw" });

    await expect(auth.loginWithPassword("a@x.in", "bad")).rejects.toThrow(/invalid/i);
    await expect(auth.loginWithPassword("a@x.in", "bad")).rejects.toThrow(/invalid/i);
    // Two failures spent the allowance — even the correct password is now throttled.
    await expect(auth.loginWithPassword("a@x.in", "pw")).rejects.toThrow(/too many/i);

    now = 1001; // past the window: the right password works and resets the counter
    expect((await auth.loginWithPassword("a@x.in", "pw")).token).toBeTruthy();
    // A later failure starts from a clean slate (not immediately throttled).
    await expect(auth.loginWithPassword("a@x.in", "bad")).rejects.toThrow(/invalid/i);
  });
});
