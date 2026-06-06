export interface IntegrationStatus {
  readonly name: string;
  readonly mode: string;
  /** Whether a real/external adapter is configured (vs an offline fake/stub default). */
  readonly live: boolean;
}

/**
 * Report which integrations are wired to real services vs offline fakes/stubs, read from the
 * environment — so an operator bringing the externally-gated pieces online (a real court source,
 * a Gemma endpoint, Tavily, WhatsApp) can confirm the wiring. Reports modes only, never secrets.
 */
export function describeConfig(
  env: Record<string, string | undefined> = process.env,
): readonly IntegrationStatus[] {
  const refreshMs = Number(env.NOWLEZ_REFRESH_INTERVAL_MS ?? 0);
  const courtSource = env.NOWLEZ_COURT_SOURCE ?? "mock";
  const dailyBriefing = env.NOWLEZ_DAILY_BRIEFING === "1" || env.NOWLEZ_DAILY_BRIEFING === "true";
  return [
    { name: "court-data", mode: courtSource, live: courtSource !== "mock" },
    {
      name: "whatsapp-webhook",
      mode: env.WHATSAPP_APP_SECRET ? "signature-verified" : "unverified",
      live: Boolean(env.WHATSAPP_APP_SECRET),
    },
    {
      name: "model",
      mode: env.NOWLEZ_MODEL_BASE_URL ? "openai-compatible" : "stub",
      live: Boolean(env.NOWLEZ_MODEL_BASE_URL),
    },
    {
      name: "web-search",
      mode: env.TAVILY_API_KEY ? "tavily" : "fake",
      live: Boolean(env.TAVILY_API_KEY),
    },
    {
      name: "whatsapp",
      mode: env.WHATSAPP_TOKEN ? "meta" : "fake",
      live: Boolean(env.WHATSAPP_TOKEN),
    },
    {
      name: "alert-push",
      mode: env.WHATSAPP_ALERT_RECIPIENT ? "configured" : "off",
      live: Boolean(env.WHATSAPP_ALERT_RECIPIENT),
    },
    {
      name: "daily-briefing",
      mode: dailyBriefing ? "on" : "off",
      live: dailyBriefing,
    },
    {
      name: "pdf-renderer",
      mode: env.NOWLEZ_PDF_RENDERER === "pdfjs" ? "pdfjs" : "fake",
      live: env.NOWLEZ_PDF_RENDERER === "pdfjs",
    },
    {
      name: "refresh-scheduler",
      mode: refreshMs > 0 ? `every ${refreshMs}ms` : "off",
      live: refreshMs > 0,
    },
  ];
}
