import type { ModelClient } from "@nowlez/contracts";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { askMunshi } from "./cli";

const USAGE = `NowLez CLI

Usage:
  nowlez munshi "<question>"   Ask the Munshi.

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
    console.log(await askMunshi(resolveModel(), question));
    return 0;
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
