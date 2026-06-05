import type { ModelClient } from "@nowlez/contracts";
import { selectCourtDataSource } from "@nowlez/court-data";
import { FakeModelClient, selectModelClient } from "@nowlez/model";
import { munshiHandlers } from "@nowlez/munshi";
import { selectWebSearch } from "@nowlez/web-search";
import { addCase, askMunshi, checkModels, listCases, refreshTracked, showCauseList } from "./cli";
import { buildEngine } from "./engine";

const USAGE = `NowLez CLI

Usage:
  nowlez add-case <CNR>        Add a case by CNR (persisted under .nowlez/).
  nowlez cases                 List added cases.
  nowlez cause-list <date>     The day's cause list for your tracked cases (YYYY-MM-DD).
  nowlez refresh               Refresh tracked cases; show any new alerts.
  nowlez munshi "<question>"   Ask the Munshi.
  nowlez check-model           Probe the configured Gemma 4 endpoint.

Court data uses the mock source for now. Set NOWLEZ_MODEL_BASE_URL + NOWLEZ_MODEL_SMALL/LARGE
for a real Gemma 4 endpoint and TAVILY_API_KEY for web search; otherwise offline stubs are used.`;

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

  if (command === "add-case") {
    const cnr = rest[0];
    if (!cnr) {
      console.error("usage: nowlez add-case <CNR>");
      return 1;
    }
    console.log(await addCase(buildEngine().caseManagement, cnr));
    return 0;
  }

  if (command === "cases") {
    console.log(await listCases(buildEngine().caseManagement));
    return 0;
  }

  if (command === "cause-list") {
    const date = rest[0];
    if (!date) {
      console.error("usage: nowlez cause-list <YYYY-MM-DD>");
      return 1;
    }
    console.log(await showCauseList(buildEngine().caseManagement, date));
    return 0;
  }

  if (command === "refresh") {
    console.log(await refreshTracked(buildEngine().tracking));
    return 0;
  }

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
