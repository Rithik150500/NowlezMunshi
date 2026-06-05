import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";
import {
  addCase,
  askMunshi,
  type CaseSummary,
  listCases,
  type MunshiReply,
  refreshCases,
} from "./api";

export function App() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [cnr, setCnr] = useState("");
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
      await addCase(cnr.trim());
      setCnr("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

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
              <strong>{c.cnr}</strong>
              <div style={styles.muted}>
                {c.court.court} · {c.orders.length} orders{c.tracking ? " · tracked" : ""}
              </div>
            </li>
          ))}
          {cases.length === 0 ? <li style={styles.muted}>No cases yet — add one by CNR.</li> : null}
        </ul>
      </aside>

      <main style={styles.middle}>
        <h2>Working area</h2>
        <p style={styles.muted}>
          Select a case to view its details, orders, and files. The document viewer, the OnlyOffice
          editor, and the URL web viewer land with the document-handling layer.
        </p>
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
  muted: { color: "#777", fontSize: "13px" },
  error: { color: "#b00020", fontSize: "13px" },
  reply: { flex: 1, overflowY: "auto", marginBottom: "8px" },
};
