import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  addCase,
  askMunshi,
  type CaseSummary,
  fileDownloadUrl,
  ingestCase,
  ingestFile,
  listCases,
  type MunshiReply,
  refreshCases,
  uploadFile,
} from "./api";

export function App() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [cnr, setCnr] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<MunshiReply | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCases(await listCases());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

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
                onClick={() => setSelected(c.cnr)}
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
      </aside>

      <main style={styles.middle}>
        {renderWorkingArea(
          cases.find((c) => c.cnr === selected),
          onUploadFile,
        )}
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

/** The middle (working-area) pane: a selected case's details, file uploads + downloads. */
function renderWorkingArea(current: CaseSummary | undefined, onUpload: (file: File) => void) {
  if (!current) {
    return (
      <>
        <h2>Working area</h2>
        <p style={styles.muted}>
          Select a case to view its details, orders, and files. The document viewer, the OnlyOffice
          editor, and the URL web viewer land with the document-handling layer.
        </p>
      </>
    );
  }
  return (
    <>
      <h2>{current.cnr}</h2>
      <p style={styles.muted}>
        {current.court.court} · {current.orders.length} order(s)
        {current.tracking ? " · tracked" : ""}
      </p>
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
              <a href={fileDownloadUrl(f.id)}>{f.documentType}</a>
              {f.origin === "ai-drafted" ? <span style={styles.muted}> · AI-drafted</span> : null}
              {f.origin === "user-uploaded" ? <span style={styles.muted}> · uploaded</span> : null}
              {f.summary ? <div style={styles.muted}>{f.summary}</div> : null}
            </li>
          ))}
        </ul>
      )}
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
  row: { display: "flex", gap: "8px", marginBottom: "8px" },
  input: { flex: 1, padding: "6px 8px", border: "1px solid #ccc", borderRadius: "4px" },
  button: { padding: "6px 10px", border: "1px solid #ccc", borderRadius: "4px", cursor: "pointer" },
  list: { listStyle: "none", padding: 0, marginTop: "12px" },
  caseItem: { padding: "8px 0", borderBottom: "1px solid #f0f0f0" },
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
