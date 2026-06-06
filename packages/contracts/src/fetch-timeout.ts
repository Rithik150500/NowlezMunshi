export type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Wrap a fetch so every call aborts after `timeoutMs`, turning a hung endpoint into a
 * clear error instead of an indefinite hang. The caller's `init` is forwarded; a fresh
 * AbortController drives the deadline (its signal is injected per call). Non-timeout
 * errors propagate unchanged.
 */
export function withTimeout(fetchFn: FetchFn, timeoutMs: number): FetchFn {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${String(input)}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}
