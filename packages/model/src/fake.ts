import type { ModelClient, ModelCompletionRequest, ModelCompletionResult } from "@nowlez/contracts";

export type FakeResponder = (request: ModelCompletionRequest) => ModelCompletionResult;

/**
 * A deterministic, network-free ModelClient for dev and tests. By default it
 * returns an empty JSON object; pass a responder to drive specific behaviour.
 */
export class FakeModelClient implements ModelClient {
  readonly id = "fake";

  constructor(private readonly responder: FakeResponder = () => ({ text: "{}" })) {}

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    return this.responder(request);
  }
}
