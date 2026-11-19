import { useCallback, useRef, useState } from "react";
import { Upload, FileUp, FileSpreadsheet, CheckCircle2, AlertTriangle, History, Info } from "lucide-react";
import { useApp } from "../../context/AppContext.jsx";
import * as api from "../../services/api.js";
import { downloadTemplate, parseWorkbookData, normalizeRows } from "../../services/intakeTemplate.js";
import { Field } from "../../components/ui/primitives.jsx";

const SAMPLE = `reference,policyholder_name,policyholder_email,policy_id,location,peril,severity,incident_date,hardship_flags,description
CLM-2026-001,Priya Raman,priya.raman@example.com,POL-77341-A,9 Sagar Nagar Visakhapatnam,Storm surge / flooding,critical,2026-11-01,"Elderly resident, Medical needs",Water through the ground floor at high tide
,,,X,14 Akkayyapalem Visakhapatnam,Wind damage,high,,,Roof partially lifted rear rooms exposed`;

export default function IntakePage() {
  const { activeEventId, toast, dataVersion } = useApp();
  const [text, setText] = useState("");
  const [running, setRunning] = useState(null); // {done, total}
  const [result, setResult] = useState(null);
  const [fatal, setFatal] = useState("");
  const fileRef = useRef(null);

  const ingest = useCallback(
    async (rows, headerErrors) => {
      setFatal("");
      setResult(null);
      setRunning({ done: 0, total: rows.length });
      try {
        const res = rows.length
          ? await api.importClaimsRows(rows, activeEventId, ({ done, total }) => setRunning({ done, total }))
          : { created: 0, errors: [], failed: 0 };
        const errors = [...(headerErrors || []), ...res.errors];
        setResult({ ...res, errors });
        setText("");
        toast(
          errors.length ? "Batch processed with validation errors" : `Imported ${res.created} claims`,
          {
            body: errors.length ? `${errors.length} row(s) rejected — see the summary below.` : "Triage has started automatically for imported claims.",
            tone: errors.length ? "warn" : "success",
          }
        );
      } catch {
        setFatal("The batch import failed. Nothing was imported — check the file and try again.");
      } finally {
        setRunning(null);
      }
    },
    [activeEventId, toast]
  );

  const run = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body) return;
    const { rows, errors } = normalizeRows(parseWorkbookData(body, true));
    ingest(rows, errors);
  };

  const onFile = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { rows, errors } = normalizeRows(parseWorkbookData(new Uint8Array(reader.result)));
        ingest(rows, errors);
      } catch {
        setFatal("We could not read that file. Download the template, fill it in and upload it again.");
      }
    };
    reader.readAsArrayBuffer(f);
  };

  return (
    <>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <h1>Bulk Claim Intake</h1>
        </div>
        <p className="page-desc">Import large batches of claims from insurer files. Claims are validated per row, then triaged automatically.</p>
      </div>

      <div className="banner banner-info">
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Download the Excel template, fill one row per claim (severity must be <code>critical | high | medium | low</code>) and upload it here —
          every column is mapped automatically. Paste-CSV also works.
        </span>
        <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: "auto", flexShrink: 0 }} onClick={downloadTemplate}>
          <FileSpreadsheet size={15} /> Download Excel template
        </button>
      </div>

      {fatal && <div className="banner banner-error" role="alert">{fatal}</div>}

      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="card card-pad" onSubmit={run}>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <div className="card-title"><FileUp size={16} /> Paste or upload batch file</div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setText(SAMPLE)}>Load sample batch</button>
          </div>
          <Field label="CSV content" htmlFor="intake-csv">
            <textarea
              id="intake-csv"
              className="textarea"
              style={{ minHeight: 180, fontFamily: "Consolas, monospace", fontSize: 12.5 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"reference,policyholder_name,…\n(1 row per claim — same columns as the Excel template)"}
            />
          </Field>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv,text/plain" style={{ display: "none" }} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <div className="row">
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Choose file…</button>
            <button type="submit" className="btn btn-primary" disabled={!text.trim() || !!running}>
              <Upload size={15} /> {running ? "Importing…" : "Start import"}
            </button>
          </div>
        </form>

        <div className="stack">
          {running && (
            <div className="card card-pad">
              <div className="card-title"><Upload size={16} /> Processing batch…</div>
              <div className="progress-track" style={{ margin: "12px 0 8px" }}>
                <div className="progress-fill" style={{ width: `${running.total ? (running.done / running.total) * 100 : 5}%` }} />
              </div>
              <div className="small muted">{running.done} of {running.total} claims created — triage queues automatically per claim.</div>
            </div>
          )}

          {result && (
            <div className="card card-pad">
              <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                {result.errors.length ? <AlertTriangle size={17} color="#d97706" /> : <CheckCircle2 size={17} color="#28734b" />}
                <div className="card-title">Import complete</div>
              </div>
              <p className="small" style={{ marginBottom: 8 }}>
                <strong style={{ color: "#28734b" }}>{result.created} claim{result.created === 1 ? "" : "s"} imported.</strong>{" "}
                {result.errors.length > 0 && <span style={{ color: "#b42318" }}>{result.errors.length} row{result.errors.length === 1 ? "" : "s"} rejected.</span>}
              </p>
              {result.errors.length > 0 && (
                <div className="table-wrap" style={{ maxHeight: 260 }}>
                  <table className="data-table">
                    <thead><tr><th>Sheet row</th><th>Problem</th></tr></thead>
                    <tbody>
                      {result.errors.map((er, i) => (
                        <tr key={i}><td>{er.row ?? er.line}</td><td className="small">{er.message}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {!running && !result && (
            <div className="card card-pad">
              <div className="card-title"><History size={16} /> How batch intake works</div>
              <ol style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 13, color: "#5b6573", display: "flex", flexDirection: "column", gap: 6 }}>
                <li>Download the Excel template — its first sheet has the exact columns, plus a field guide.</li>
                <li>Rows are validated individually — one bad row never blocks the whole batch.</li>
                <li>Valid claims are created in the selected event and queued for triage with all their details.</li>
                <li>Processing continues in the background with live progress and a completion summary.</li>
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
