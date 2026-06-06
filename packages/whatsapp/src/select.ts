import type { WhatsAppClient } from "@nowlez/contracts";
import { FakeWhatsAppClient } from "./fake";
import { MetaWhatsAppClient } from "./meta";

export type WhatsAppKind = "fake" | "meta";

/**
 * Select a WhatsAppClient (ADR-0013). The fake is the default (so tests and CI
 * never touch a network); "meta" reads its credentials from the environment.
 */
export function selectWhatsAppClient(kind: WhatsAppKind = "fake"): WhatsAppClient {
  switch (kind) {
    case "fake":
      return new FakeWhatsAppClient();
    case "meta": {
      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
      if (!token || !phoneNumberId) {
        throw new Error("meta whatsapp client requires WHATSAPP_TOKEN and WHATSAPP_PHONE_ID");
      }
      return new MetaWhatsAppClient({ token, phoneNumberId });
    }
    default:
      return assertNever(kind);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled whatsapp kind: ${String(x)}`);
}
