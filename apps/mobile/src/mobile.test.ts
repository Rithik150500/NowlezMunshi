import { describe, expect, it } from "vitest";
import { createMobileApp, NowlezClient } from "./index";

/** A fetch that returns a fixed JSON body and records the calls. */
function recordingFetch(body: unknown) {
  const calls: { url: string; method: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

/** Like recordingFetch but also captures each request's headers (to assert the bearer token). */
function recordingAuthFetch(body: unknown) {
  const calls: { url: string; method: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const SESSION = {
  token: "tok-123",
  expiresAt: "2099-01-01T00:00:00Z",
  userId: "u1",
  firmId: "f1",
  role: "principal",
};

describe("NowlezClient", () => {
  it("lists and adds cases over the HTTP API", async () => {
    const { fetchImpl, calls } = recordingFetch([{ cnr: "KLER010012342026" }]);
    const client = new NowlezClient({ baseUrl: "http://x/api", fetch: fetchImpl });

    expect(await client.listCases()).toHaveLength(1);
    await client.addCase("KLER010012342026");

    expect(calls[0]).toEqual({ url: "http://x/api/cases", method: "GET" });
    expect(calls[1]).toEqual({ url: "http://x/api/cases", method: "POST" });
  });

  it("asks the Munshi and surfaces the tool-call trace", async () => {
    const { fetchImpl } = recordingFetch({
      text: "ok",
      citations: [],
      toolCalls: [{ name: "read", ok: true }],
    });
    const reply = await new NowlezClient({ fetch: fetchImpl }).askMunshi("hi");
    expect(reply.text).toBe("ok");
    expect(reply.toolCalls[0]?.name).toBe("read");
  });

  it("throws on a non-ok response", async () => {
    const failing = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    await expect(new NowlezClient({ fetch: failing }).listCases()).rejects.toThrow(/HTTP 500/);
  });
});

describe("NowlezClient auth", () => {
  it("stores the session token on login and sends it on later requests", async () => {
    const { fetchImpl, calls } = recordingAuthFetch(SESSION);
    const client = new NowlezClient({ baseUrl: "http://x/api", fetch: fetchImpl });

    const session = await client.loginWithPassword("a@x.in", "pw");
    expect(session.token).toBe("tok-123");
    expect(client.getToken()).toBe("tok-123");

    // The login request itself carries no token; a subsequent call does.
    expect(calls[0]?.headers.authorization).toBeUndefined();
    await client.listCases();
    expect(calls[1]?.headers.authorization).toBe("Bearer tok-123");
  });

  it("starts authenticated from a provided token", async () => {
    const { fetchImpl, calls } = recordingAuthFetch([]);
    const client = new NowlezClient({ fetch: fetchImpl, token: "seed-tok" });
    await client.listCases();
    expect(calls[0]?.headers.authorization).toBe("Bearer seed-tok");
  });

  it("requests an OTP without a session, then verifies it for a token", async () => {
    const { fetchImpl, calls } = recordingAuthFetch(SESSION);
    const client = new NowlezClient({ baseUrl: "http://x/api", fetch: fetchImpl });

    await client.requestOtp("919812345678");
    expect(calls[0]).toMatchObject({ url: "http://x/api/auth/otp/request", method: "POST" });
    expect(client.getToken()).toBeUndefined();

    const session = await client.verifyOtp("919812345678", "123456");
    expect(session.token).toBe("tok-123");
    expect(client.getToken()).toBe("tok-123");
  });

  it("clears the token on logout", async () => {
    const { fetchImpl } = recordingAuthFetch({ ok: true });
    const client = new NowlezClient({ fetch: fetchImpl, token: "seed-tok" });
    await client.logout();
    expect(client.getToken()).toBeUndefined();
  });
});

describe("createMobileApp", () => {
  it("exposes the auth gate, CASES, and MUNSHI surfaces over the client", () => {
    const app = createMobileApp();
    expect(typeof app.auth.loginWithPassword).toBe("function");
    expect(typeof app.auth.logout).toBe("function");
    expect(typeof app.cases.list).toBe("function");
    expect(typeof app.cases.causeList).toBe("function");
    expect(typeof app.munshi.ask).toBe("function");
  });
});
