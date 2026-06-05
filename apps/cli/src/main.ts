import type { ModelClient } from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { munshiHandlers } from "@nowlez/munshi";
import { selectWebSearch } from "@nowlez/web-search";
import { askMunshi, checkModels } from "./cli";

const USAGE = `NowLez CLI

Usage:
  nowlez munshi "<question>"   Ask the Munshi.
  nowlez check-model          Probe the configured Gemma 4 endpoint.

Models: set NOWLEZ_MODEL_BASE_URL + NOWLEZ_MODEL_SMALL + NOWLEZ_MODEL_LARGE
(and NOWLEZ_MODEL_API_KEY if your endpoint needs one) to use your Gemma 4 endpoint.
Without them, a clearly-labelled stub reply is used so the CLI runs offline.`;

/** Use the real Gemma endpoint when configured; otherwise a labelled offline stub. */
function resolveModel(): ModelClient {
  if (process.env.NOWLEZ_MODEL_BASE_URL) {
    return selectModelClient("openai-compatible");
  }
  return new FakeModelClient(() => ({
    text: JSON.stringify({
      text: "(stub Munshi reply — set NOWLEZ_MODEL_BASE_URL + NOWLEZ_MODEL_SMALL/LARGE to use Gemma 4.)",
      citations: [],
    }),
  }));
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;

  if (command === "munshi") {
    const question = rest.join(" ").trim();
    if (!question) {
      console.error('usage: nowlez munshi "<question>"');
      return 1;
    }
    const handlers = munshiHandlers({
      courts: selectCourtDataSource(),
      webSearch: selectWebSearch(process.env.TAVILY_API_KEY ? "tavily" : "fake"),
    });
    console.log(await askMunshi(resolveModel(), question, handlers));
    return 0;
  }

  if (command === "check-model") {
    if (!process.env.NOWLEZ_MODEL_BASE_URL) {
      console.error(
        "No model endpoint configured. Set NOWLEZ_MODEL_BASE_URL + NOWLEZ_MODEL_SMALL/LARGE (see .env.example).",
      );
      return 1;
    }
    const results = await checkModels(selectModelClient("openai-compatible"));
    for (const result of results) {
      console.log(`${result.ok ? "✓" : "✗"} ${result.model}: ${result.detail}`);
    }
    return results.every((result) => result.ok) ? 0 : 1;
  }

  console.log(USAGE);
  return command === undefined || command === "help" ? 0 : 1;
}

try {
  process.exit(await main(process.argv.slice(2)));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
