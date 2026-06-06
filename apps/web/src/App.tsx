import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  type AlertSummary,
  addCase,
  askMunshi,
  type CaseSummary,
  type CauseListEntry,
  type FileSummary,
  fileDownloadUrl,
  fileText,
  fileViewUrl,
  getCauseList,
  ingestCase,
  ingestFile,
  listAlerts,
  listCases,
  type MunshiReply,
  markAlertRead,
  refreshCases,
  uploadFile,
} from "./api";

const TODAY = new Date().toISOString().slice(0, 10);

export function App() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [cnr, setCnr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [causeDate, setCauseDate] = useState(TODAY);
  const [causeList, setCauseList] = useState<CauseListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<MunshiReply | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [cs, as] = await Promise.all([listCases(), listAlerts()]);
      setCases(cs);
      setAlerts(as);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const onMarkAlertRead = useCallback(
    async (id: string) => {
      await markAlertRead(id).catch(() => undefined);
      await reload();
    },
    [reload],
  );

  const loadCauseList = useCallback(async () => {
    try {
      setCauseList(await getCauseList(causeDate));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [causeDate]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onAddCase(event: FormEvent) {
    event.preventDefault();
    if (!cnr.trim()) {
      return;
    }
    try {
      const added = cnr.trim();
      await addCase(added);
      setCnr("");
      // Best-effort: summarise the freshly-fetched orders so they enter the Munshi's context.
      await ingestCase(added).catch(() => undefined);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const onUploadFile = useCallback(
    async (file: File) => {
      if (!selected) {
        return;
      }
      try {
        const { id } = await uploadFile(selected, file);
        // Best-effort ingestion (classify + summarise); the raw file is already stored.
        await ingestFile(id).catch(() => undefined);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [selected, reload],
  );

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) {
      return;
    }
    setBusy(true);
    try {
      setReply(await askMunshi(question.trim()));
    } catch (e) {
      setReply({ text: `Error: ${e instanceof Error ? e.message : String(e)}`, citations: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.app}>
      <aside style={styles.left}>
        <h1 style={styles.brand}>NowLez</h1>
        <form onSubmit={onAddCase} style={styles.row}>
          <input
            aria-label="CNR"
            placeholder="Add case by CNR"
            value={cnr}
            onChange={(e) => setCnr(e.target.value)}
            style={styles.input}
          />
          <button type="submit" style={styles.button}>
            + Case
          </button>
        </form>
        <button
          type="button"
          onClick={() => void refreshCases().then(() => reload())}
          style={styles.button}
        >
          Refresh & alerts
        </button>
        {error ? <p style={styles.error}>{error}</p> : null}
        <ul style={styles.list}>
          {cases.map((c) => (
            <li key={c.cnr} style={styles.caseItem}>
              <button
                type="button"
                onClick={() => {
                  setSelected(c.cnr);
                  setViewing(null);
                }}
                style={c.cnr === selected ? styles.caseButtonActive : styles.caseButton}
              >
                <strong>{c.cnr}</strong>
                <div style={styles.muted}>
                  {c.court.court} · {c.orders.length} orders{c.tracking ? " · tracked" : ""}
                  {c.files.length > 0 ? ` · ${c.files.length} file(s)` : ""}
                </div>
              </button>
            </li>
          ))}
          {cases.length === 0 ? <li style={styles.muted}>No cases yet — add one by CNR.</li> : null}
        </ul>
        {alerts.length > 0 ? (
          <>
            <h2 style={styles.sectionTitle}>Alerts</h2>
            <ul style={styles.list}>
              {alerts.map((a) => (
                <li key={a.id} style={styles.caseItem}>
                  <div style={a.read ? styles.muted : undefined}>
                    [{a.kind}] {a.cnr}
                  </div>
                  <div style={styles.muted}>{a.message}</div>
                  {a.read ? null : (
                    <button
                      type="button"
                      style={styles.button}
                      onClick={() => onMarkAlertRead(a.id)}
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h2 style={styles.sectionTitle}>Cause list</h2>
        <div style={styles.row}>
          <input
            type="date"
            aria-label="Cause-list date"
            value={causeDate}
            onChange={(e) => setCauseDate(e.target.value)}
            style={styles.input}
          />
          <button type="button" style={styles.button} onClick={() => void loadCauseList()}>
            Show
          </button>
        </div>
        {causeList !== null &&
          (causeList.length === 0 ? (
            <p style={styles.muted}>Nothing listed for {causeDate}.</p>
          ) : (
            <ul style={styles.list}>
              {causeList.map((e) => (
                <li key={e.cnr ?? e.caseNumber ?? e.date} style={styles.caseItem}>
                  <div>{e.cnr ?? e.caseNumber ?? "—"}</div>
                  <div style={styles.muted}>
                    {[e.parties, e.purpose].filter(Boolean).join(" · ") || e.date}
                  </div>
                </li>
              ))}
            </ul>
          ))}
      </aside>

      <main style={styles.middle}>
        {renderWorkingArea({
          current: cases.find((c) => c.cnr === selected),
          onUpload: onUploadFile,
          viewingId: viewing,
          onView: setViewing,
        })}
      </main>

      <section style={styles.right}>
        <h2>Munshi</h2>
        <div style={styles.reply}>
          {reply ? (
            <>
              <p>{reply.text}</p>
              {reply.citations.length > 0 ? (
                <p style={styles.muted}>{reply.citations.length} citation(s)</p>
              ) : null}
            </>
          ) : (
            <p style={styles.muted}>Ask the Munshi about your cases.</p>
          )}
        </div>
        <form onSubmit={onAsk} style={styles.row}>
          <input
            aria-label="Ask the Munshi"
            placeholder="Ask the Munshi…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            style={styles.input}
          />
          <button type="submit" disabled={busy} style={styles.button}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </section>
    </div>
  );
}

interface WorkingAreaProps {
  readonly current: CaseSummary | undefined;
  readonly onUpload: (file: File) => void;
  readonly viewingId: string | null;
  readonly onView: (fileId: string | null) => void;
}

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Can the browser render this content type inline (PDF / image) via an iframe? */
function canPreview(contentType: string): boolean {
  return contentType === "application/pdf" || contentType.startsWith("image/");
}

/** A docx text preview: fetches the server-extracted text for the selected document. */
function DocxPreview({ fileId }: { fileId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setText(null);
    setFailed(false);
    fileText(fileId)
      .then((r) => {
        if (!cancelled) {
          setText(r.text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);
  if (failed) {
    return <p style={styles.muted}>Could not extract text — use Download.</p>;
  }
  if (text === null) {
    return <p style={styles.muted}>Loading…</p>;
  }
  return <pre style={styles.docxText}>{text}</pre>;
}

/** Render a file in the viewer: iframe for PDF/image, text for docx, else a download hint. */
function FileBody({ file }: { file: FileSummary }) {
  if (canPreview(file.original.contentType)) {
    return <iframe title={file.id} src={fileViewUrl(file.id)} style={styles.iframe} />;
  }
  if (file.original.contentType === DOCX_CONTENT_TYPE) {
    return <DocxPreview fileId={file.id} />;
  }
  return (
    <p style={styles.muted}>
      No inline preview for this type ({file.original.contentType}) — use Download.
    </p>
  );
}

/** The middle (working-area) pane: a selected case's details, orders, files, and a viewer. */
function renderWorkingArea({ current, onUpload, viewingId, onView }: WorkingAreaProps) {
  if (!current) {
    return (
      <>
        <h2>Working area</h2>
        <p style={styles.muted}>
          Select a case to view its details, orders, and files. The OnlyOffice editor and the URL
          web viewer land with the document-handling layer.
        </p>
      </>
    );
  }
  const viewing = current.files.find((f) => f.id === viewingId);
  const rows: ReadonlyArray<readonly [string, string | number | undefined]> = [
    ["Parties", current.details.parties],
    ["Status", current.details.status],
    ["Next hearing", current.details.nextHearingDate],
    ["Type", current.details.caseType],
    ["Number", current.details.caseNumber],
    ["Year", current.details.year],
    ["Filed", current.details.filingDate],
    ["Registered", current.details.registrationDate],
  ];
  return (
    <>
      <h2>{current.cnr}</h2>
      <p style={styles.muted}>
        {current.court.court}
        {current.tracking ? " · tracked" : ""}
      </p>
      <dl style={styles.details}>
        {rows
          .filter(([, value]) => value !== undefined && value !== "")
          .map(([label, value]) => (
            <div key={label} style={styles.detailRow}>
              <dt style={styles.detailLabel}>{label}</dt>
              <dd style={styles.detailValue}>{value}</dd>
            </div>
          ))}
      </dl>

      <h3>Orders</h3>
      {current.orders.length === 0 ? (
        <p style={styles.muted}>No orders.</p>
      ) : (
        <ul style={styles.list}>
          {current.orders.map((o) => (
            <li key={o.id} style={styles.caseItem}>
              {o.summary ? o.summary : <span style={styles.muted}>(not yet ingested)</span>}
            </li>
          ))}
        </ul>
      )}

      <div style={styles.row}>
        <h3 style={{ margin: 0 }}>Files</h3>
        <label style={styles.button}>
          + Files
          <input
            type="file"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onUpload(file);
              }
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {current.files.length === 0 ? (
        <p style={styles.muted}>
          No files yet — upload one, or ask the Munshi to draft a document.
        </p>
      ) : (
        <ul style={styles.list}>
          {current.files.map((f) => (
            <li key={f.id} style={styles.caseItem}>
              <button type="button" style={styles.linkButton} onClick={() => onView(f.id)}>
                {f.documentType}
              </button>{" "}
              <a href={fileDownloadUrl(f.id)}>Download</a>
              {f.origin === "ai-drafted" ? <span style={styles.muted}> · AI-drafted</span> : null}
              {f.origin === "user-uploaded" ? <span style={styles.muted}> · uploaded</span> : null}
              {f.summary ? <div style={styles.muted}>{f.summary}</div> : null}
            </li>
          ))}
        </ul>
      )}

      {viewing ? (
        <div style={styles.viewer}>
          <div style={styles.row}>
            <h3 style={{ margin: 0 }}>{viewing.documentType}</h3>
            <button type="button" style={styles.button} onClick={() => onView(null)}>
              Close
            </button>
          </div>
          <FileBody file={viewing} />
        </div>
      ) : null}
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  app: {
    display: "grid",
    gridTemplateColumns: "260px 1fr 320px",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
  },
  left: { borderRight: "1px solid #e5e5e5", padding: "16px", overflowY: "auto" },
  middle: { padding: "16px", overflowY: "auto" },
  right: {
    borderLeft: "1px solid #e5e5e5",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
  },
  brand: { fontSize: "20px", margin: "0 0 16px" },
  sectionTitle: { fontSize: "14px", margin: "16px 0 0" },
  row: { display: "flex", gap: "8px", marginBottom: "8px" },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #ccc", borderRadius: "4px" },
  button: { padding: "6px 10px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" },
  list: { listStyle: "none", padding: 0, marginTop: "12px" },
  caseItem: { padding: "8px 0", borderBottom: "1px solid #f0f0f0" },
  details: { margin: "0 0 8px" },
  detailRow: { display: "flex", gap: "8px", fontSize: "13px", padding: "2px 0" },
  detailLabel: { width: "110px", color: "#777", margin: 0 },
  detailValue: { margin: 0 },
  linkButton: {
    background: "none",
    border: "none",
    padding: 0,
    color: "#1a4ed8",
    cursor: "pointer",
    font: "inherit",
    textDecoration: "underline",
  },
  viewer: { marginTop: "16px" },
  iframe: { width: "100%", height: "60vh", border: "1px solid #e5e5e5", borderRadius: "4px" },
  docxText: {
    whiteSpace: "pre-wrap",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    background: "#fafafa",
    border: "1px solid #e5e5e5",
    borderRadius: "4px",
    padding: "12px",
    maxHeight: "60vh",
    overflowY: "auto",
  },
  caseButton: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
  },
  caseButtonActive: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "#f5f7ff",
    border: "none",
    padding: "4px",
    font: "inherit",
    color: "inherit",
    cursor: "pointer",
  },
  muted: { color: "#777", fontSize: "13px" },
  error: { color: "#b00020", fontSize: "13px" },
  reply: { flex: 1, overflowY: "auto", marginBottom: "8px" },
};
