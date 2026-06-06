import { describe, expect, it } from "vitest";
import { type FetchFn, withTimeout } from "./fetch-timeout";

describe("withTimeout", () => {
  it("passes a fast response through unchanged", async () => {
    const fast: FetchFn = async () => new Response("hi", { status: 200 });
    const res = await withTimeout(fast, 1000)("https://x");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hi");
  });

  it("aborts and throws a timeout error when the request hangs past the deadline", async () => {
    const hanging: FetchFn = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
    await expect(withTimeout(hanging, 10)("https://x")).rejects.toThrow(/timed out/i);
  });

  it("propagates a non-timeout error unchanged", async () => {
    const boom: FetchFn = async () => {
      throw new Error("network down");
    };
    await expect(withTimeout(boom, 1000)("https://x")).rejects.toThrow(/network down/);
  });

  it("forwards the caller's init (method, headers, body)", async () => {
    let seen: RequestInit | undefined;
    const capture: FetchFn = async (_input, init) => {
      seen = init;
      return new Response("{}", { status: 200 });
    };
    await withTimeout(capture, 1000)("https://x", { method: "POST", body: "data" });
    expect(seen?.method).toBe("POST");
    expect(seen?.body).toBe("data");
  });
});
