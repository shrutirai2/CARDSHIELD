// ================================================================
// App.js — CARDSHIELD: Credit Card Fraud Detection Frontend
// React 18 + Tailwind CSS | Premium Dark Cyber-Finance Theme
// Backend: Flask at https://cardshield-backend.onrender.com
// ================================================================

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";

// ── Config ───────────────────────────────────────────────────────
const API_BASE = "https://cardshield-backend.onrender.com";

const V_FIELDS     = Array.from({ length: 28 }, (_, i) => `V${i + 1}`);
const FEATURE_COLS = ["Time", ...V_FIELDS, "Amount"];
const EMPTY_FORM   = Object.fromEntries(FEATURE_COLS.map((f) => [f, ""]));

const SAMPLE_FRAUD = {
  Time:"406",    V1:"-2.3122265423263",   V2:"1.95199201064158",
  V3:"-1.60985073229769",  V4:"3.9979055875468",    V5:"-0.522187864667764",
  V6:"-1.42654531920595",  V7:"-2.53738730624579",  V8:"1.39165724829804",
  V9:"-2.77008927719433",  V10:"-2.77227214465915", V11:"3.20203320709635",
  V12:"-2.89990738849473", V13:"-0.595221881324605",V14:"-4.28925378244217",
  V15:"0.389724120274487", V16:"-1.14074717980657", V17:"-2.83005567450437",
  V18:"-0.0168224681808257",V19:"0.416955705037907",V20:"0.126910559061474",
  V21:"0.517232370861764", V22:"-0.035049369774219",V23:"-0.465211076182388",
  V24:"0.320198198514526", V25:"0.0445191674731941",V26:"0.177839798284401",
  V27:"0.261145002567677", V28:"-0.143275874698919",Amount:"0.00",
};

const SAMPLE_LEGIT = {
  Time:"0",      V1:"-1.3598071336738",   V2:"-0.0727811733098497",
  V3:"2.53634673796914",   V4:"1.37815522427443",   V5:"-0.338320769942518",
  V6:"0.462387777762292",  V7:"0.239598554061257",  V8:"0.0986979012610507",
  V9:"0.363786969611213",  V10:"0.0907941719789316",V11:"-0.55159953199358",
  V12:"-0.617800855762348",V13:"-0.991389847235408",V14:"-0.311169353699879",
  V15:"1.46817697209427",  V16:"-0.470400525259478",V17:"0.207971241929242",
  V18:"0.0257905801985591",V19:"0.403992960255733", V20:"0.251412098239705",
  V21:"-0.018306777944153",V22:"0.277837575558899", V23:"-0.110473910188767",
  V24:"0.0669280749146731",V25:"0.128539358273528", V26:"-0.189114843888824",
  V27:"0.133558376740387", V28:"-0.0210530534538215",Amount:"149.62",
};

const STATS = {
  total:284807, fraud:492, legit:284315,
  auc:0.9812, precision:0.947, recall:0.821, f1:0.879,
};

// ================================================================
// API HELPERS
// ================================================================
async function apiPost(endpoint, payload) {
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, payload);
  } catch {
    throw new Error("BACKEND_DOWN");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function predictSingle(form) {
  const body = Object.fromEntries(
    Object.entries(form).map(([k, v]) => [k, parseFloat(v)])
  );
  return apiPost("/predict_single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function predictBatch(file) {
  const fd = new FormData();
  fd.append("file", file);
  return apiPost("/predict_batch", { method: "POST", body: fd });
}

function exportCSV(results) {
  const header = "row,label,prediction,fraud_probability";
  const rows   = results.map(
    (r) => `${r.row},${r.label},${r.prediction},${r.fraud_probability}`
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const a    = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: "fraud_results.csv",
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ================================================================
// SHARED PRIMITIVES
// ================================================================

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-[#1e2d4a] bg-[#0b1120]/80
      backdrop-blur-xl shadow-2xl shadow-black/60 ${className}`}>
      {children}
    </div>
  );
}

function Label({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#3a5580] mb-3">
      {children}
    </p>
  );
}

function FieldInput({ name, value, onChange, placeholder = "0.000", large }) {
  return (
    <div>
      <label className={`block mb-1 ${large ? "text-xs text-[#7a9cc5]" : "text-[10px] text-[#3a5580]"}`}>
        {name}
      </label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
        placeholder={placeholder}
        className={`w-full rounded-lg bg-[#0d1829] border border-[#1e2d4a]
          text-[#c8daf0] placeholder-[#1e3050]
          focus:outline-none focus:border-[#3b82f6]/60 focus:bg-[#0f1f38]
          transition-all duration-200 no-spin
          ${large ? "px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-xs"}`}
      />
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  const isDown = msg === "BACKEND_DOWN";
  return (
    <div className={`mt-4 rounded-xl border p-4 text-sm
      ${isDown
        ? "border-amber-500/30 bg-amber-500/[0.06] text-amber-400"
        : "border-red-500/30   bg-red-500/[0.06]   text-red-400"}`}>
      {isDown ? (
        <>
          <p className="font-semibold mb-1">⚠ Cannot reach Flask backend</p>
          <p className="text-xs opacity-75">
            Run <code className="bg-white/10 px-1.5 rounded">python app.py</code> then
            refresh. Expected at{" "}
            <code className="bg-white/10 px-1.5 rounded">{API_BASE}</code>
          </p>
        </>
      ) : (
        <p><span className="font-semibold">Error — </span>{msg}</p>
      )}
    </div>
  );
}

function Spinner({ label = "Analysing…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-[#4a7ab5] text-sm">
      <span className="block w-5 h-5 rounded-full border-2 border-[#1e3a6a]
        border-t-[#3b82f6] animate-spin" />
      {label}
    </div>
  );
}

function Verdict({ result, innerRef }) {
  if (!result) return null;
  const fraud = result.prediction === 1;
  const pct   = (result.fraud_probability * 100).toFixed(2);
  return (
    <div
      ref={innerRef}
      style={{ animation: "riseIn .5s cubic-bezier(.22,1,.36,1) both" }}
      className={`mt-6 rounded-2xl border p-6 scroll-mt-6 relative overflow-hidden
        ${fraud
          ? "border-red-500/30 bg-red-950/30"
          : "border-emerald-500/30 bg-emerald-950/20"}`}
    >
      {/* Glow accent */}
      <div className={`absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20
        ${fraud ? "bg-red-500" : "bg-emerald-500"}`} />

      <div className="flex items-center gap-4 relative z-10">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl
          border ${fraud
            ? "border-red-500/30 bg-red-500/10"
            : "border-emerald-500/30 bg-emerald-500/10"}`}>
          {fraud ? "⚠️" : "✅"}
        </div>
        <div className="flex-1">
          <p className={`text-lg font-bold tracking-tight ${fraud ? "text-red-400" : "text-emerald-400"}`}
            style={{ fontFamily: "'Syne', sans-serif" }}>
            {fraud ? "Fraud Detected" : "Legitimate Transaction"}
          </p>
          <p className="text-xs text-[#3a5580] mt-0.5">
            Fraud probability: <span className="text-[#7a9cc5] font-medium">{pct}%</span>
          </p>
        </div>
        <p className={`text-4xl font-black tabular-nums
          ${fraud ? "text-red-400" : "text-emerald-400"}`}
          style={{ fontFamily: "'Syne', sans-serif" }}>
          {pct}%
        </p>
      </div>
      <div className="mt-5 h-2 rounded-full bg-[#0d1829] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out
            ${fraud ? "bg-gradient-to-r from-red-600 to-red-400" : "bg-gradient-to-r from-emerald-600 to-emerald-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ================================================================
// TAB 1 — SINGLE TRANSACTION
// ================================================================
function SingleTab() {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [vOpen,   setVOpen]   = useState(false);
  const resultRef = useRef();

  const onChange = (e) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const load = (sample) => {
    setForm(sample);
    setResult(null);
    setError(null);
    setVOpen(false);
  };

  const reset = () => {
    setForm(EMPTY_FORM);
    setResult(null);
    setError(null);
    setVOpen(false);
  };

  const submit = async () => {
    const missing = FEATURE_COLS.filter((f) => form[f] === "");
    if (missing.length) {
      setError(`Fill in: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? " …" : ""}`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await predictSingle(form);
      setResult(data);
      setTimeout(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
      , 120);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sample loader */}
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => load(SAMPLE_FRAUD)}
          className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
            bg-red-500/10 border border-red-500/20 text-red-400
            hover:bg-red-500/20 hover:border-red-500/40 hover:scale-[1.02]
            active:scale-[.98] transition-all duration-200 shadow-sm shadow-red-900/20">
          <span className="text-base">⚠</span> Load Sample Fraud
        </button>
        <button onClick={() => load(SAMPLE_LEGIT)}
          className="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
            bg-emerald-500/10 border border-emerald-500/20 text-emerald-400
            hover:bg-emerald-500/20 hover:border-emerald-500/40 hover:scale-[1.02]
            active:scale-[.98] transition-all duration-200 shadow-sm shadow-emerald-900/20">
          <span className="text-base">✓</span> Load Sample Legit
        </button>
        <button onClick={reset}
          className="px-4 py-2.5 rounded-xl text-sm text-[#3a5580] border border-[#1e2d4a]
            hover:text-[#7a9cc5] hover:bg-[#0f1d36] hover:scale-[1.02]
            active:scale-[.98] transition-all duration-200">
          ↺ Reset
        </button>
      </div>

      {/* Time & Amount */}
      <Card className="p-6">
        <Label>Transaction Details</Label>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput name="Time"   value={form.Time}   onChange={onChange}
            placeholder="e.g. 0"      large />
          <FieldInput name="Amount" value={form.Amount} onChange={onChange}
            placeholder="e.g. 149.62" large />
        </div>
        <p className="mt-3 text-[10px] text-[#1e3050] leading-relaxed">
          <code className="text-[#3a5580]">Time</code> = seconds since first transaction ·{" "}
          <code className="text-[#3a5580]">Amount</code> = transaction value (USD)
        </p>
      </Card>

      {/* V1–V28 collapsible */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setVOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4
            hover:bg-[#0f1d36]/60 transition-colors text-left">
          <span className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#3a5580]">
              PCA Features
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10
              border border-blue-500/20 text-blue-400 text-[10px] font-bold">
              V1 – V28
            </span>
          </span>
          <span className={`text-[#3a5580] text-xs transition-transform duration-300
            ${vOpen ? "rotate-180" : ""}`}>▼</span>
        </button>

        <div
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{ maxHeight: vOpen ? "900px" : "0", opacity: vOpen ? 1 : 0 }}>
          <div className="border-t border-[#1e2d4a] px-6 pb-6 pt-4">
            <p className="text-[10px] text-[#1e3050] mb-4">
              PCA-transformed anonymised features. Pre-filled when using sample data.
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5">
              {V_FIELDS.map((f) => (
                <FieldInput key={f} name={f} value={form[f]} onChange={onChange} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={loading}
        className="w-full py-4 rounded-xl font-bold text-white tracking-widest text-sm
          bg-gradient-to-r from-blue-700 to-indigo-700
          hover:from-blue-600 hover:to-indigo-600
          active:scale-[.99] disabled:opacity-40 disabled:cursor-not-allowed
          shadow-lg shadow-blue-900/40 hover:shadow-blue-700/50
          transition-all duration-200 border border-blue-600/30"
        style={{ fontFamily: "'Syne', sans-serif", letterSpacing: "0.12em" }}>
        {loading ? "ANALYSING…" : "ANALYSE TRANSACTION →"}
      </button>

      {loading && <Spinner />}
      <ErrorMsg msg={error} />
      <Verdict result={result} innerRef={resultRef} />
    </div>
  );
}

// ================================================================
// TAB 2 — BATCH UPLOAD
// ================================================================
function BatchTab() {
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [drag,    setDrag]    = useState(false);
  const fileRef   = useRef();
  const resultRef = useRef();

  const parsePreview = (f) =>
    Papa.parse(f, {
      header: true, skipEmptyLines: true, preview: 5,
      complete: (r) => setPreview(r.data),
    });

  const accept = (f) => {
    if (!f?.name?.endsWith(".csv")) { setError("Upload a .csv file."); return; }
    setFile(f);
    setError(null);
    setResults(null);
    setSummary(null);
    parsePreview(f);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    accept(e.dataTransfer.files[0]);
  }, []);

  const remove = (e) => {
    e.stopPropagation();
    setFile(null); setPreview(null); setResults(null); setSummary(null); setError(null);
  };

  const run = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await predictBatch(file);
      setResults(data.results);
      setSummary(data.summary);
      setTimeout(() =>
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      , 120);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const previewCols = preview?.[0] ? Object.keys(preview[0]).slice(0, 7) : [];

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onClick={() => fileRef.current.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center
          transition-all duration-300 select-none relative overflow-hidden
          ${drag
            ? "border-blue-400 bg-blue-500/[0.07] scale-[1.01]"
            : "border-[#1e2d4a] hover:border-blue-500/40 hover:bg-[#0b1829]/50"}`}>

        {/* Subtle grid inside drop zone */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(#3b82f6 1px,transparent 1px),linear-gradient(90deg,#3b82f6 1px,transparent 1px)",
            backgroundSize: "28px 28px",
          }} />

        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => accept(e.target.files[0])} />

        <div className="text-5xl mb-4 relative">{file ? "📄" : "📂"}</div>
        <p className="font-bold text-[#7a9cc5] text-base relative"
          style={{ fontFamily: "'Syne', sans-serif" }}>
          {file ? file.name : "Drop CSV here or click to browse"}
        </p>
        <p className="text-xs text-[#2a4060] mt-2 relative">
          Required columns: Time, V1–V28, Amount · Class column is ignored
        </p>

        {file && (
          <div className="mt-4 flex items-center justify-center gap-4 text-xs relative">
            <span className="text-blue-400 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
            <button onClick={remove}
              className="text-[#2a4060] hover:text-red-400 transition-colors font-semibold">
              ✕ Remove
            </button>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <Card className="p-4 overflow-x-auto">
          <Label>Preview — first 5 rows</Label>
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr>
                {previewCols.map((k) => (
                  <th key={k} className="text-left pr-5 pb-2 text-[#3a5580] font-semibold whitespace-nowrap">
                    {k}
                  </th>
                ))}
                <th className="text-[#1e3050] pb-2">…</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-[#1e2d4a]">
                  {previewCols.map((k) => (
                    <td key={k} className="pr-5 py-1.5 text-[#7a9cc5] whitespace-nowrap font-mono">
                      {String(row[k] ?? "").slice(0, 10)}
                    </td>
                  ))}
                  <td className="text-[#1e3050]">…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {file && (
        <button onClick={run} disabled={loading}
          className="w-full py-4 rounded-xl font-bold text-white tracking-widest text-sm
            bg-gradient-to-r from-blue-700 to-indigo-700
            hover:from-blue-600 hover:to-indigo-600
            active:scale-[.99] disabled:opacity-40 disabled:cursor-not-allowed
            shadow-lg shadow-blue-900/40 transition-all duration-200 border border-blue-600/30"
          style={{ fontFamily: "'Syne', sans-serif", letterSpacing: "0.12em" }}>
          {loading ? "PROCESSING…" : "RUN BATCH ANALYSIS →"}
        </button>
      )}

      {loading && <Spinner label="Processing all transactions…" />}
      <ErrorMsg msg={error} />

      {summary && (
        <div ref={resultRef}
          style={{ animation: "riseIn .5s cubic-bezier(.22,1,.36,1) both" }}
          className="scroll-mt-6 space-y-4">

          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Total",      value:summary.total_transactions, color:"text-[#c8daf0]"   },
              { label:"Fraud",      value:summary.fraud_detected,     color:"text-red-400"     },
              { label:"Legitimate", value:summary.legit_detected,     color:"text-emerald-400" },
            ].map(({ label, value, color }) => (
              <Card key={label} className="p-5 text-center">
                <p className="text-[10px] uppercase tracking-widest text-[#3a5580] mb-1">{label}</p>
                <p className={`text-2xl font-black ${color}`}
                  style={{ fontFamily: "'Syne', sans-serif" }}>{value.toLocaleString()}</p>
              </Card>
            ))}
          </div>

          <button onClick={() => exportCSV(results)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
              bg-emerald-500/10 border border-emerald-500/20 text-emerald-400
              hover:bg-emerald-500/20 hover:scale-[1.01] active:scale-[.98] transition-all">
            ⬇ Download Results as CSV
          </button>
        </div>
      )}

      {results?.length > 0 && (
        <Card className="p-4 overflow-x-auto">
          <Label>Predictions — {results.length} rows</Label>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-[#3a5580] text-left">
                <th className="pb-3 pr-4 font-semibold">Row</th>
                <th className="pb-3 pr-4 font-semibold">Verdict</th>
                <th className="pb-3 pr-4 font-semibold">Probability</th>
                <th className="pb-3 font-semibold">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isFraud = r.prediction === 1;
                const pct = (r.fraud_probability * 100).toFixed(1);
                return (
                  <tr key={r.row} className="border-t border-[#1e2d4a] hover:bg-[#0f1d36]/50 transition-colors">
                    <td className="py-2.5 pr-4 text-[#3a5580] text-xs font-mono">#{r.row}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold
                        ${isFraud
                          ? "bg-red-500/10 text-red-400 border border-red-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                        {r.label}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[#7a9cc5] text-xs font-mono">{pct}%</td>
                    <td className="py-2.5 w-32">
                      <div className="h-1.5 bg-[#0d1829] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isFraud
                            ? "bg-gradient-to-r from-red-600 to-red-400"
                            : "bg-gradient-to-r from-emerald-600 to-emerald-400"}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ================================================================
// TAB 3 — DASHBOARD
// ================================================================
function DashboardTab() {
  const fraudPct = ((STATS.fraud / STATS.total) * 100).toFixed(3);

  const metrics = [
    { label:"Total Transactions", value:STATS.total.toLocaleString(), color:"text-[#c8daf0]"  },
    { label:"Fraud Cases",  value:STATS.fraud.toLocaleString(),  color:"text-red-400",    sub:`${fraudPct}% of dataset` },
    { label:"Legitimate",   value:STATS.legit.toLocaleString(),  color:"text-emerald-400" },
    { label:"AUC-ROC",      value:STATS.auc.toFixed(4),          color:"text-blue-400",   sub:"Discrimination ability (max 1.0)" },
  ];

  const perfBars = [
    { label:"Precision", value:STATS.precision, grad:"from-blue-700 to-blue-400",
      tip:"Of all flagged fraud, how many were actually fraud." },
    { label:"Recall",    value:STATS.recall,    grad:"from-emerald-700 to-emerald-400",
      tip:"Of all real fraud cases, how many were caught." },
    { label:"F1 Score",  value:STATS.f1,        grad:"from-violet-700 to-violet-400",
      tip:"Harmonic mean of Precision and Recall." },
    { label:"AUC-ROC",   value:STATS.auc,       grad:"from-sky-700 to-sky-400",
      tip:"Discrimination ability across all thresholds." },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl px-4 py-3 bg-blue-500/[0.07] border border-blue-500/15
        text-blue-400 text-sm flex items-center gap-3">
        <span className="text-lg">📊</span>
        Statistics from XGBoost model — held-out 20% test set (56,962 transactions).
      </div>

      <div className="grid grid-cols-2 gap-4">
        {metrics.map(({ label, value, color, sub }) => (
          <Card key={label} className="p-5 group hover:border-[#2a4070] transition-colors">
            <Label>{label}</Label>
            <p className={`text-3xl font-black ${color}`}
              style={{ fontFamily: "'Syne', sans-serif" }}>{value}</p>
            {sub && <p className="text-[10px] text-[#2a4060] mt-1">{sub}</p>}
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <Label>Model Performance</Label>
        <div className="space-y-6">
          {perfBars.map(({ label, value, grad, tip }) => (
            <div key={label}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm text-[#c8daf0] font-semibold"
                    style={{ fontFamily: "'Syne', sans-serif" }}>{label}</p>
                  <p className="text-[10px] text-[#2a4060] mt-0.5 leading-relaxed max-w-xs">{tip}</p>
                </div>
                <p className="text-xl font-black text-[#c8daf0] tabular-nums"
                  style={{ fontFamily: "'Syne', sans-serif" }}>
                  {(value * 100).toFixed(1)}%
                </p>
              </div>
              <div className="h-2.5 rounded-full bg-[#0d1829] overflow-hidden border border-[#1e2d4a]">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${grad}`}
                  style={{ width: `${(value * 100).toFixed(0)}%`,
                    animation: "expandBar .9s cubic-bezier(.22,1,.36,1) both" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <Label>Class Distribution</Label>
        <div className="h-10 rounded-xl overflow-hidden bg-[#0d1829] flex border border-[#1e2d4a]">
          <div
            className="h-full bg-gradient-to-r from-emerald-800 to-emerald-600 flex items-center"
            style={{ width: `${100 - parseFloat(fraudPct)}%` }}>
            <span className="text-[11px] font-bold text-emerald-200 px-4 truncate">
              Legit {(100 - parseFloat(fraudPct)).toFixed(1)}%
            </span>
          </div>
          <div
            className="h-full bg-gradient-to-r from-red-700 to-red-500 flex items-center justify-center"
            style={{ width: `${Math.max(parseFloat(fraudPct), 2)}%` }}>
            <span className="text-[11px] text-red-200 font-bold">⚠</span>
          </div>
        </div>

        <div className="flex gap-6 mt-4 text-xs text-[#3a5580]">
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-600" />
            Legit — {(100 - parseFloat(fraudPct)).toFixed(3)}%
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-red-600" />
            Fraud — {fraudPct}%
          </span>
        </div>

        <p className="mt-3 text-[10px] text-[#1e3050]">
          Severe imbalance ({(STATS.legit / STATS.fraud).toFixed(0)}:1 ratio) mitigated via{" "}
          <code className="text-[#3a5580] bg-[#0d1829] px-1.5 rounded">scale_pos_weight</code> in XGBoost.
        </p>
      </Card>
    </div>
  );
}

// ================================================================
// ROOT — App Shell
// ================================================================
const TABS = [
  { id:"single",    icon:"🔍", label:"Single Transaction" },
  { id:"batch",     icon:"📦", label:"Batch Upload"        },
  { id:"dashboard", icon:"📊", label:"Dashboard"           },
];

const KEYFRAMES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Space+Mono:wght@400;700&display=swap');

  @keyframes riseIn {
    from { opacity:0; transform:translateY(16px) }
    to   { opacity:1; transform:translateY(0)    }
  }
  @keyframes expandBar {
    from { width:0 }
  }
  @keyframes gradShift {
    0%,100% { background-position: 0% 50% }
    50%     { background-position: 100% 50% }
  }
  @keyframes shieldPulse {
    0%,100% { opacity:0.7; transform:scale(1) }
    50%     { opacity:1;   transform:scale(1.06) }
  }
  @keyframes scanline {
    from { transform: translateY(-100%) }
    to   { transform: translateY(400%) }
  }
  .no-spin::-webkit-inner-spin-button,
  .no-spin::-webkit-outer-spin-button { -webkit-appearance:none; margin:0 }
  .no-spin { -moz-appearance:textfield }

  .tab-active-glow {
    box-shadow: 0 0 20px rgba(59,130,246,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
  }
`;

export default function App() {
  const [tab, setTab] = useState("single");

  return (
    <div className="min-h-screen text-[#c8daf0] antialiased"
      style={{ backgroundColor: "#050c1a" }}>
      <style>{KEYFRAMES}</style>

      {/* ── Background layers ─────────────────────────── */}
      {/* Deep navy base gradient */}
      <div className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% -20%, #0a1f4a 0%, #050c1a 70%)",
        }} />

      {/* Fine circuit-board grid */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(#3b82f6 1px,transparent 1px)," +
            "linear-gradient(90deg,#3b82f6 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

      {/* Large blue radial orb — top left */}
      <div className="fixed pointer-events-none"
        style={{
          top: "-20%", left: "-10%",
          width: "70vw", height: "70vw",
          background: "radial-gradient(circle, rgba(29,78,216,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />

      {/* Violet orb — bottom right */}
      <div className="fixed pointer-events-none"
        style={{
          bottom: "-25%", right: "-10%",
          width: "60vw", height: "60vw",
          background: "radial-gradient(circle, rgba(79,70,229,0.10) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />

      {/* Subtle scanline effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-[0.015]">
        <div className="w-full h-[200px]"
          style={{
            background: "linear-gradient(transparent, rgba(59,130,246,0.5), transparent)",
            animation: "scanline 8s linear infinite",
          }} />
      </div>

      {/* ── Header ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-[#0f1e38]"
        style={{ background: "rgba(5,12,26,0.85)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">

          {/* Shield icon */}
          <div className="relative shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 to-indigo-800
              flex items-center justify-center text-xl shadow-lg shadow-blue-900/50
              border border-blue-600/30"
              style={{ animation: "shieldPulse 3s ease-in-out infinite" }}>
              🛡
            </div>
            <div className="absolute inset-0 rounded-xl blur-md opacity-40
              bg-blue-600 -z-10" />
          </div>

          {/* Brand name */}
          <div>
            <h1 className="text-2xl font-black tracking-[0.08em] leading-none"
              style={{
                fontFamily: "'Syne', sans-serif",
                background: "linear-gradient(135deg, #60a5fa 0%, #818cf8 50%, #38bdf8 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
              CARDSHIELD
            </h1>
            <p className="text-[10px] text-[#2a4a70] font-semibold tracking-[0.2em] uppercase mt-0.5"
              style={{ fontFamily: "'Space Mono', monospace" }}>
              Credit Card Fraud Detection · XGBoost
            </p>
          </div>

          {/* Live badge */}
          <div className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full
            text-[10px] font-bold text-emerald-400 tracking-widest uppercase
            bg-emerald-500/[0.08] border border-emerald-500/20"
            style={{ fontFamily: "'Space Mono', monospace" }}>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Model Live
          </div>
        </div>
      </header>

      {/* ── Hero accent line under header ──────────────── */}
      <div className="h-px w-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #1e4080 30%, #3b82f6 50%, #1e4080 70%, transparent 100%)",
        }} />

      {/* ── Tab bar ────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="flex gap-2 p-1.5 rounded-2xl border border-[#0f1e38]"
          style={{ background: "rgba(8,16,32,0.80)" }}>
          {TABS.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2.5 px-4 py-3.5
                rounded-xl text-sm font-bold transition-all duration-300
                ${tab === id
                  ? "bg-gradient-to-br from-blue-700 to-indigo-700 text-white tab-active-glow border border-blue-500/30"
                  : "text-[#3a5580] hover:text-[#7a9cc5] hover:bg-[#0b1829] border border-transparent"}`}
              style={{ fontFamily: "'Syne', sans-serif", letterSpacing: "0.04em" }}>
              <span className="text-base">{icon}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-6 py-7"
        style={{ animation: "riseIn .4s cubic-bezier(.22,1,.36,1) both" }}>
        {tab === "single"    && <SingleTab />}
        {tab === "batch"     && <BatchTab  />}
        {tab === "dashboard" && <DashboardTab />}
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="max-w-3xl mx-auto px-6 py-6 border-t border-[#0f1e38]
        text-[10px] text-[#1e3050] text-center"
        style={{ fontFamily: "'Space Mono', monospace" }}>
        Final Year B.Tech Project · XGBoost + Flask + React ·{" "}
        <code className="text-[#2a4060]">{API_BASE}</code>
      </footer>
    </div>
  );
}