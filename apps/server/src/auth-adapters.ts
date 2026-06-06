import type { GoogleIdentity, GoogleVerifier, OtpSender, WhatsAppClient } from "@nowlez/contracts";

/** Deliver the OTP over WhatsApp (the phone is already the channel identity, ADR-0013/0019). */
export function whatsAppOtpSender(whatsApp: WhatsAppClient): OtpSender {
  return {
    async send(phone, code) {
      await whatsApp.sendMessage(
        phone,
        `Your NowLez verification code is ${code}. It expires in 5 minutes.`,
      );
    },
  };
}

/**
 * Verify a Google ID token via Google's `tokeninfo` endpoint and check the audience. A dependency-free
 * real adapter (the offline `FakeGoogleVerifier` is used in tests); enabled when `GOOGLE_CLIENT_ID`
 * is set, per ADR-0019.
 */
export class TokeninfoGoogleVerifier implements GoogleVerifier {
  constructor(private readonly clientId: string) {}

  async verify(idToken: string): Promise<GoogleIdentity> {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) {
      throw new Error("Google token verification failed.");
    }
    const payload = (await res.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      aud?: string;
    };
    if (!payload.sub || payload.aud !== this.clientId) {
      throw new Error("Invalid Google token.");
    }
    return { sub: payload.sub, email: payload.email, name: payload.name };
  }
}
