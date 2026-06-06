import { createHmac } from "node:crypto";
import { CaseManagement } from "@nowlez/case-management";
import { asFileId } from "@nowlez/contracts";
import { MockCourtDataSource, SAMPLE_CNR, sampleFetchedCase } from "@nowlez/court-data";
import { IngestionPipeline } from "@nowlez/file-management";
import { FakeModelClient } from "@nowlez/model";
import { Munshi } from "@nowlez/munshi";
import { InMemoryAlertStore, InMemoryCaseRepository } from "@nowlez/persistence";
import { InMemoryBlobStore } from "@nowlez/storage";
import { TrackingService } from "@nowlez/tracking";
import { FakeWhatsAppClient } from "@nowlez/whatsapp";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import type { ServerEngine } from "./engine";

function testEngine(): ServerEngine {
  const courts = new MockCourtDataSource();
  const repo = new InMemoryCaseRepository();
  // One client serves both jobs: the small model returns ingestion JSON, the large the Munshi reply.
  const model = new FakeModelClient((req) =>
    req.model === "small"
      ? {
          text: JSON.stringify({
            cnr: SAMPLE_CNR,
            documentType: "evidence",
            summary: "An uploaded document.",
          }),
        }
      : { text: JSON.stringify({ text: "ok", citations: [] }) },
  );
  return {
    caseManagement: new CaseManagement(courts, repo),
    tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
    munshi: new Munshi(model),
    handlers: {},
    ingestion: new IngestionPipeline(undefined, model),
    blobs: new InMemoryBlobStore(),
    docxReader: { extractText: async () => "Extracted docx text." },
    alerts: new InMemoryAlertStore(),
    whatsApp: new FakeWhatsAppClient(),
    whatsAppVerifyToken: "secret",
    alertRecipient: "",
  };
}

const DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("HTTP API", () => {
  it("reports health", async () => {
    const res = await createApp(testEngine()).request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("reports integration configuration status", async () => {
    const res = await createApp(testEngine()).request("/config");
    expect(res.status).toBe(200);
    const status = (await res.json()) as { name: string }[];
    expect(status.map((s) => s.name)).toEqual(
      expect.arrayContaining(["court-data", "model", "web-search", "whatsapp"]),
    );
  });

  it("adds, lists, and fetches a case", async () => {
    const app = createApp(testEngine());
    const add = await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    expect(add.status).toBe(201);

    const list = await app.request("/cases");
    expect(((await list.json()) as unknown[]).length).toBe(1);

    const one = await app.request(`/cases/${SAMPLE_CNR}`);
    expect(one.status).toBe(200);
  });

  it("400s when adding a case without a CNR", async () => {
    const res = await createApp(testEngine()).request("/cases", post({}));
    expect(res.status).toBe(400);
  });

  it("searches by party and by case number (400 on missing fields)", async () => {
    const app = createApp(testEngine());

    const party = await app.request(
      "/search/party",
      post({ scope: { stateOrHighCourt: "Kerala" }, partyName: "petitioner", year: 2026 }),
    );
    expect(party.status).toBe(200);
    expect(((await party.json()) as unknown[]).length).toBe(1);

    const byNumber = await app.request(
      "/search/case-number",
      post({
        scope: { stateOrHighCourt: "Kerala" },
        caseType: "OS",
        caseNumber: "1234",
        year: 2026,
      }),
    );
    expect(byNumber.status).toBe(200);
    expect(((await byNumber.json()) as unknown[]).length).toBe(1);

    expect((await app.request("/search/party", post({ partyName: "x" }))).status).toBe(400);
  });

  it("answers the Munshi", async () => {
    const res = await createApp(testEngine()).request("/munshi", post({ message: "hi" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { text: string }).text).toBe("ok");
  });

  it("gives the Munshi the user's cases as context", async () => {
    const courts = new MockCourtDataSource();
    const repo = new InMemoryCaseRepository();
    let seen = "";
    const model = new FakeModelClient((req) => {
      seen = req.messages.map((m) => m.content).join("\n");
      return { text: JSON.stringify({ text: "ok", citations: [] }) };
    });
    const engine: ServerEngine = {
      caseManagement: new CaseManagement(courts, repo),
      tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
      munshi: new Munshi(model),
      handlers: {},
      ingestion: new IngestionPipeline(),
      blobs: new InMemoryBlobStore(),
      docxReader: { extractText: async () => "" },
      alerts: new InMemoryAlertStore(),
      whatsApp: new FakeWhatsAppClient(),
      whatsAppVerifyToken: "secret",
      alertRecipient: "",
    };
    const app = createApp(engine);
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    await app.request("/munshi", post({ message: "what's listed?" }));
    expect(seen).toContain(SAMPLE_CNR);
  });

  it("refreshes tracked cases", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    const res = await app.request("/refresh", { method: "POST" });
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("cross-references the cause list for a date (400 without one)", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    // The sample case's next hearing is 2026-06-20, so it appears on that day.
    const listed = await app.request("/cause-list?date=2026-06-20");
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as unknown[]).length).toBe(1);

    expect((await app.request("/cause-list")).status).toBe(400);
  });
});

describe("WhatsApp webhook", () => {
  it("verifies the subscription with the challenge", async () => {
    const res = await createApp(testEngine()).request(
      "/whatsapp?hub.mode=subscribe&hub.verify_token=secret&hub.challenge=12345",
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("rejects verification with a bad token", async () => {
    const res = await createApp(testEngine()).request(
      "/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    );
    expect(res.status).toBe(403);
  });

  it("routes an inbound message to the Munshi and replies via WhatsApp", async () => {
    const engine = testEngine();
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "15551234567", type: "text", text: { body: "status?" } }],
              },
            },
          ],
        },
      ],
    };
    const res = await createApp(engine).request("/whatsapp", post(body));
    expect(res.status).toBe(200);
    expect((engine.whatsApp as FakeWhatsAppClient).sent[0]).toEqual({
      to: "15551234567",
      text: "ok",
    });
  });

  it("answers a 'case <CNR>' command with case details", async () => {
    const engine = testEngine();
    const app = createApp(engine);
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { from: "15551234567", type: "text", text: { body: `case ${SAMPLE_CNR}` } },
                ],
              },
            },
          ],
        },
      ],
    };
    await app.request("/whatsapp", post(body));
    const sent = (engine.whatsApp as FakeWhatsAppClient).sent;
    expect(sent[0]?.to).toBe("15551234567");
    expect(sent[0]?.text).toContain(SAMPLE_CNR);
    expect(sent[0]?.text).toContain("Orders:");
  });

  it("delivers a stored file as a WhatsApp document", async () => {
    const engine = testEngine();
    const app = createApp(engine);
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }));
    const up = await app.request(`/cases/${SAMPLE_CNR}/files`, { method: "POST", body: fd });
    const { id } = (await up.json()) as { id: string };

    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "15551234567", type: "text", text: { body: `file ${id}` } }],
              },
            },
          ],
        },
      ],
    };
    await app.request("/whatsapp", post(body));
    const docs = (engine.whatsApp as FakeWhatsAppClient).documents;
    expect(docs[0]?.to).toBe("15551234567");
    expect([...(docs[0]?.document.bytes ?? [])]).toEqual([1, 2, 3]);
  });
});

describe("WhatsApp webhook security", () => {
  const inboundBody = (from: string, text: string) => ({
    entry: [{ changes: [{ value: { messages: [{ from, type: "text", text: { body: text } }] } }] }],
  });
  const signed = (body: unknown, secret: string): RequestInit => {
    const payload = JSON.stringify(body);
    return {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`,
      },
      body: payload,
    };
  };

  it("rejects an inbound webhook with no valid signature when an app secret is set", async () => {
    const engine = { ...testEngine(), whatsAppAppSecret: "app-secret" };
    const res = await createApp(engine).request(
      "/whatsapp",
      post(inboundBody("15551234567", "status?")),
    );
    expect(res.status).toBe(403);
    expect((engine.whatsApp as FakeWhatsAppClient).sent).toHaveLength(0);
  });

  it("processes an inbound webhook with a valid signature", async () => {
    const engine = { ...testEngine(), whatsAppAppSecret: "app-secret" };
    const res = await createApp(engine).request(
      "/whatsapp",
      signed(inboundBody("15551234567", "status?"), "app-secret"),
    );
    expect(res.status).toBe(200);
    expect((engine.whatsApp as FakeWhatsAppClient).sent[0]?.to).toBe("15551234567");
  });

  it("ignores an inbound message from a sender not in the allow-list", async () => {
    const engine = { ...testEngine(), whatsAppAllowedSenders: ["15551234567"] };
    const res = await createApp(engine).request(
      "/whatsapp",
      post(inboundBody("19999999999", "status?")),
    );
    expect(res.status).toBe(200);
    expect((engine.whatsApp as FakeWhatsAppClient).sent).toHaveLength(0);
  });

  it("processes an inbound message from an allowed sender", async () => {
    const engine = { ...testEngine(), whatsAppAllowedSenders: ["15551234567"] };
    await createApp(engine).request("/whatsapp", post(inboundBody("15551234567", "status?")));
    expect((engine.whatsApp as FakeWhatsAppClient).sent[0]?.to).toBe("15551234567");
  });
});

describe("file download", () => {
  it("streams a stored File's bytes with a download filename", async () => {
    const courts = new MockCourtDataSource();
    const repo = new InMemoryCaseRepository();
    const blobs = new InMemoryBlobStore();
    const ref = await blobs.put(new Uint8Array([1, 2, 3]), DOCX_CT);
    await repo.save({
      cnr: SAMPLE_CNR,
      court: { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" },
      details: {},
      tracking: true,
      orders: [],
      files: [
        {
          id: asFileId("F1"),
          cnr: SAMPLE_CNR,
          original: ref,
          pageImages: [],
          documentType: "petition",
          summary: "A petition.",
          origin: "ai-drafted",
        },
      ],
    });
    const engine: ServerEngine = {
      caseManagement: new CaseManagement(courts, repo),
      tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
      munshi: new Munshi(new FakeModelClient(() => ({ text: "{}" }))),
      handlers: {},
      ingestion: new IngestionPipeline(),
      blobs,
      docxReader: { extractText: async () => "Extracted docx text." },
      alerts: new InMemoryAlertStore(),
      whatsApp: new FakeWhatsAppClient(),
      whatsAppVerifyToken: "secret",
      alertRecipient: "",
    };
    const app = createApp(engine);

    const res = await app.request("/files/F1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(DOCX_CT);
    expect(res.headers.get("content-disposition")).toContain("petition.docx");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);

    // ?disposition=inline serves it for the in-browser viewer.
    const inline = await app.request("/files/F1?disposition=inline");
    expect(inline.headers.get("content-disposition")).toContain("inline");

    // Text preview (docx) extracts via the DocxReader.
    const txt = await app.request("/files/F1/text");
    expect(txt.status).toBe(200);
    expect((await txt.json()) as { text: string }).toMatchObject({ text: "Extracted docx text." });

    expect((await app.request("/files/NOPE")).status).toBe(404);
    expect((await app.request("/files/NOPE/text")).status).toBe(404);
  });
});

describe("file upload", () => {
  it("uploads a document, attaches it as user-uploaded, and downloads it back", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    const fd = new FormData();
    fd.append(
      "file",
      new File([new Uint8Array([7, 8, 9])], "evidence.pdf", { type: "application/pdf" }),
    );
    fd.append("documentType", "evidence");
    const up = await app.request(`/cases/${SAMPLE_CNR}/files`, { method: "POST", body: fd });
    expect(up.status).toBe(201);
    const { id } = (await up.json()) as { id: string };

    const detail = (await (await app.request(`/cases/${SAMPLE_CNR}`)).json()) as {
      files: { id: string; origin: string }[];
    };
    expect(detail.files).toHaveLength(1);
    expect(detail.files[0]?.origin).toBe("user-uploaded");

    const dl = await app.request(`/files/${id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/pdf");
    expect([...new Uint8Array(await dl.arrayBuffer())]).toEqual([7, 8, 9]);

    // Text preview is docx-only — a PDF is 415.
    expect((await app.request(`/files/${id}/text`)).status).toBe(415);
  });

  it("404s uploading to an unknown case; 400s with no file part", async () => {
    const app = createApp(testEngine());
    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }));
    expect((await app.request("/cases/NOPE/files", { method: "POST", body: fd })).status).toBe(404);

    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    const empty = new FormData();
    empty.append("documentType", "evidence");
    const res = await app.request(`/cases/${SAMPLE_CNR}/files`, { method: "POST", body: empty });
    expect(res.status).toBe(400);
  });
});

describe("file ingestion", () => {
  it("ingests an uploaded file — fills documentType, summary, and page images", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    const fd = new FormData();
    fd.append("file", new File([new Uint8Array([1, 2, 3])], "scan.png", { type: "image/png" }));
    const up = await app.request(`/cases/${SAMPLE_CNR}/files`, { method: "POST", body: fd });
    const { id } = (await up.json()) as { id: string };

    const ing = await app.request(`/files/${id}/ingest`, { method: "POST" });
    expect(ing.status).toBe(200);
    expect((await ing.json()) as { documentType: string }).toMatchObject({
      documentType: "evidence",
    });

    const detail = (await (await app.request(`/cases/${SAMPLE_CNR}`)).json()) as {
      files: { documentType: string; summary: string; pageImages: unknown[] }[];
    };
    expect(detail.files[0]?.documentType).toBe("evidence");
    expect(detail.files[0]?.summary).toBe("An uploaded document.");
    expect(detail.files[0]?.pageImages.length).toBeGreaterThan(0);
  });

  it("404s ingesting an unknown file", async () => {
    const res = await createApp(testEngine()).request("/files/NOPE/ingest", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("ingests a case's raw orders — fills their summaries + page images", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    const res = await app.request(`/cases/${SAMPLE_CNR}/ingest`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await res.json()) as { ingested: number }).toMatchObject({ ingested: 1 });

    const detail = (await (await app.request(`/cases/${SAMPLE_CNR}`)).json()) as {
      orders: { summary: string; pageImages: unknown[] }[];
    };
    expect(detail.orders[0]?.summary).toBe("An uploaded document.");
    expect(detail.orders[0]?.pageImages.length).toBeGreaterThan(0);

    expect(
      (await createApp(testEngine()).request("/cases/NOPE/ingest", { method: "POST" })).status,
    ).toBe(404);
  });
});

describe("alerts", () => {
  const COURT = { stateOrHighCourt: "Kerala", districtOrBench: "Ernakulam", court: "PDC" };

  async function alertEngine(recipient = "") {
    const courts = new MockCourtDataSource();
    const repo = new InMemoryCaseRepository();
    const whatsApp = new FakeWhatsAppClient();
    const engine: ServerEngine = {
      caseManagement: new CaseManagement(courts, repo),
      tracking: new TrackingService(courts, repo, { now: () => "2026-06-05T00:00:00Z" }),
      munshi: new Munshi(new FakeModelClient(() => ({ text: "{}" }))),
      handlers: {},
      ingestion: new IngestionPipeline(),
      blobs: new InMemoryBlobStore(),
      docxReader: { extractText: async () => "" },
      alerts: new InMemoryAlertStore(),
      whatsApp,
      whatsAppVerifyToken: "secret",
      alertRecipient: recipient,
    };
    // Stale snapshot: active case matching the source's details but missing the order, so the only
    // change on refresh is the new order (one alert).
    await repo.save({
      cnr: SAMPLE_CNR,
      court: COURT,
      details: { ...sampleFetchedCase.details },
      tracking: true,
      orders: [],
      files: [],
    });
    return { engine, whatsApp };
  }

  it("refresh persists new alerts, exposes the feed, and marks one read", async () => {
    const app = createApp((await alertEngine()).engine);
    await app.request("/refresh", { method: "POST" });

    const feed = (await (await app.request("/alerts")).json()) as {
      id: string;
      kind: string;
      read: boolean;
    }[];
    expect(feed).toHaveLength(1);
    expect(feed[0]?.kind).toBe("new-order");

    const id = feed[0]?.id ?? "";
    expect((await app.request(`/alerts/${id}/read`, { method: "POST" })).status).toBe(200);
    const after = (await (await app.request("/alerts")).json()) as { read: boolean }[];
    expect(after[0]?.read).toBe(true);

    expect((await app.request("/alerts/NOPE/read", { method: "POST" })).status).toBe(404);
  });

  it("pushes new alerts to a configured WhatsApp recipient", async () => {
    const { engine, whatsApp } = await alertEngine("15551234567");
    await createApp(engine).request("/refresh", { method: "POST" });
    expect(whatsApp.sent).toHaveLength(1);
    expect(whatsApp.sent[0]?.to).toBe("15551234567");
    expect(whatsApp.sent[0]?.text).toContain("new-order");
  });
});

describe("hearings digest", () => {
  it("buckets a tracked case's next hearing relative to today", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));

    const res = await app.request("/hearings?today=2026-06-15");
    expect(res.status).toBe(200);
    const digest = (await res.json()) as {
      today: string;
      counts: Record<string, number>;
      entries: { cnr: string; bucket: string; date?: string; daysUntil?: number }[];
    };
    expect(digest.today).toBe("2026-06-15");
    // The sample case's next hearing is 2026-06-20 — 5 days out -> "this week".
    expect(digest.entries).toHaveLength(1);
    expect(digest.entries[0]).toMatchObject({
      cnr: SAMPLE_CNR,
      bucket: "thisWeek",
      date: "2026-06-20",
      daysUntil: 5,
    });
    expect(digest.counts.thisWeek).toBe(1);
  });

  it("honours the horizon override", async () => {
    const app = createApp(testEngine());
    await app.request("/cases", post({ cnr: SAMPLE_CNR }));
    // today well before the hearing + a tight 3-day window -> "later".
    const res = await app.request("/hearings?today=2026-06-01&horizon=3");
    const digest = (await res.json()) as { counts: Record<string, number> };
    expect(digest.counts.later).toBe(1);
  });
});
