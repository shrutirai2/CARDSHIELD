// ================================================================
// App.js — FraudShield: Credit Card Fraud Detection Frontend
// React 18 + Tailwind CSS | Dark Glassmorphism Theme
// Backend: Flask at http://localhost:5000
// ================================================================

import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";

// ── Config ───────────────────────────────────────────────────────
const API_BASE = "https://cardshield-backend.onrender.com";

// Feature columns in exact training order: Time, V1–V28, Amount
const V_FIELDS    = Array.from({ length: 28 }, (_, i) => `V${i + 1}`);
const FEATURE_COLS = ["Time", ...V_FIELDS, "Amount"];
const EMPTY_FORM   = Object.fromEntries(FEATURE_COLS.map((f) => [f, ""]));

// ── Sample Data (real Kaggle creditcard.csv rows) ─────────────────
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

// Mock dashboard stats — replace with real /stats endpoint if added later
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

// Glass card wrapper
function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.04]
      backdrop-blur-xl shadow-2xl shadow-black/40 ${className}`}>
      {children}
    </div>
  );
}

// Section label above cards
function Label({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-3">
      {children}
    </p>
  );
}

// Styled number input
function FieldInput({ name, value, onChange, placeholder = "0.000", large }) {
  return (
    <div>
      <label className={`block mb-1 ${large ? "text-xs text-slate-400" : "text-[10px] text-slate-500"}`}>
        {name}
      </label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
        placeholder={placeholder}
        className={`w-full rounded-lg bg-white/[0.04] border border-white/[0.08]
          text-slate-200 placeholder-slate-700
          focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.07]
          transition-all duration-200 no-spin
          ${large ? "px-3 py-2.5 text-sm" : "px-2.5 py-1.5 text-xs"}`}
      />
    </div>
  );
}

// Backend-down vs regular error display
function ErrorMsg({ msg }) {
  if (!msg) return null;
  const isDown = msg === "BACKEND_DOWN";
  return (
    <div className={`mt-4 rounded-xl border p-4 text-sm
      ${isDown
        ? "border-amber-500/30 bg-amber-500/[0.08] text-amber-400"
        : "border-red-500/30   bg-red-500/[0.08]   text-red-400"}`}>
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

// Spinner with label
function Spinner({ label = "Analysing…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-slate-400 text-sm">
      <span className="block w-5 h-5 rounded-full border-2 border-indigo-400/40
        border-t-indigo-400 animate-spin" />
      {label}
    </div>
  );
}

// Verdict banner shown after single prediction
function Verdict({ result, innerRef }) {
  if (!result) return null;
  const fraud = result.prediction === 1;
  const pct   = (result.fraud_probability * 100).toFixed(2);
  return (
    <div
      ref={innerRef}
      style={{ animation: "riseIn .45s cubic-bezier(.22,1,.36,1) both" }}
      className={`mt-6 rounded-2xl border p-5 scroll-mt-6
        ${fraud
          ? "border-red-500/30   bg-red-500/[0.08]"
          : "border-emerald-500/30 bg-emerald-500/[0.08]"}`}
    >
      <div className="flex items-center gap-4">
        <span className="text-4xl">{fraud ? "⚠️" : "✅"}</span>
        <div className="flex-1">
          <p className={`text-lg font-bold ${fraud ? "text-red-400" : "text-emerald-400"}`}>
            {fraud ? "Fraud Detected" : "Legitimate Transaction"}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Fraud probability: <span className="text-slate-300 font-medium">{pct}%</span>
          </p>
        </div>
        <p className={`text-4xl font-black tabular-nums
          ${fraud ? "text-red-400" : "text-emerald-400"}`}>
          {pct}%
        </p>
      </div>
      {/* Probability bar */}
      <div className="mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out
            ${fraud ? "bg-red-400" : "bg-emerald-400"}`}
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

      {/* Sample loader buttons */}
      <div className="flex flex-wrap gap-2.5">
        <button onClick={() => load(SAMPLE_FRAUD)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            bg-red-500/10 border border-red-500/25 text-red-400
            hover:bg-red-500/20 active:scale-[.98] transition-all">
          ⚠ Load Sample Fraud
        </button>
        <button onClick={() => load(SAMPLE_LEGIT)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            bg-emerald-500/10 border border-emerald-500/25 text-emerald-400
            hover:bg-emerald-500/20 active:scale-[.98] transition-all">
          ✓ Load Sample Legit
        </button>
        <button onClick={reset}
          className="px-4 py-2 rounded-lg text-sm text-slate-500 border border-white/[0.06]
            hover:text-slate-300 hover:bg-white/[0.05] active:scale-[.98] transition-all">
          ↺ Reset
        </button>
      </div>

      {/* Time & Amount — prominent */}
      <Card className="p-6">
        <Label>Transaction Details</Label>
        <div className="grid grid-cols-2 gap-4">
          <FieldInput name="Time"   value={form.Time}   onChange={onChange}
            placeholder="e.g. 0"      large />
          <FieldInput name="Amount" value={form.Amount} onChange={onChange}
            placeholder="e.g. 149.62" large />
        </div>
        <p className="mt-3 text-[10px] text-slate-600 leading-relaxed">
          <code className="text-slate-500">Time</code> = seconds since first transaction in dataset ·{" "}
          <code className="text-slate-500">Amount</code> = transaction value (USD)
        </p>
      </Card>

      {/* V1–V28 collapsible */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setVOpen((v) => !v)}
          className="w-full flex items-center justify-between px-6 py-4
            hover:bg-white/[0.03] transition-colors text-left">
          <span className="flex items-center gap-3">
            <Label>PCA Features&nbsp;</Label>
            <span className="px-2 py-0.5 rounded-full bg-indigo-500/15
              border border-indigo-500/25 text-indigo-400 text-[10px] font-semibold -mt-3">
              V1 – V28
            </span>
          </span>
          <span className={`text-slate-600 text-xs transition-transform duration-300
            ${vOpen ? "rotate-180" : ""}`}>▼</span>
        </button>

        <div
          className="overflow-hidden transition-all duration-500 ease-in-out"
          style={{ maxHeight: vOpen ? "900px" : "0", opacity: vOpen ? 1 : 0 }}>
          <div className="border-t border-white/[0.06] px-6 pb-6 pt-4">
            <p className="text-[10px] text-slate-600 mb-4">
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
        className="w-full py-3.5 rounded-xl font-semibold text-white tracking-wide
          bg-indigo-600 hover:bg-indigo-500 active:scale-[.99]
          disabled:opacity-40 disabled:cursor-not-allowed
          shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35
          transition-all duration-200">
        {loading ? "Analysing…" : "Analyse Transaction →"}
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

  // Visible columns for the preview table (first 7 cols + "…")
  const previewCols = preview?.[0] ? Object.keys(preview[0]).slice(0, 7) : [];

  return (
    <div className="space-y-6">

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onClick={() => fileRef.current.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center
          transition-all duration-200 select-none
          ${drag
            ? "border-indigo-400 bg-indigo-500/[0.08] scale-[1.01]"
            : "border-white/[0.1] hover:border-indigo-500/40 hover:bg-white/[0.03]"}`}>
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => accept(e.target.files[0])} />

        <div className="text-5xl mb-3">{file ? "📄" : "📂"}</div>

        <p className="font-semibold text-slate-300">
          {file ? file.name : "Drop CSV here or click to browse"}
        </p>
        <p className="text-xs text-slate-600 mt-1.5">
          Required columns: Time, V1–V28, Amount · Class column is ignored
        </p>

        {file && (
          <div className="mt-3 flex items-center justify-center gap-3 text-xs">
            <span className="text-indigo-400">{(file.size / 1024).toFixed(1)} KB</span>
            <button onClick={remove}
              className="text-slate-600 hover:text-red-400 transition-colors">
              ✕ Remove
            </button>
          </div>
        )}
      </div>

      {/* CSV preview */}
      {preview && (
        <Card className="p-4 overflow-x-auto">
          <Label>Preview — first 5 rows</Label>
          <table className="w-full text-xs min-w-max">
            <thead>
              <tr>
                {previewCols.map((k) => (
                  <th key={k} className="text-left pr-5 pb-2 text-slate-500 font-medium whitespace-nowrap">
                    {k}
                  </th>
                ))}
                <th className="text-slate-600 pb-2">…</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="border-t border-white/[0.05]">
                  {previewCols.map((k) => (
                    <td key={k} className="pr-5 py-1.5 text-slate-400 whitespace-nowrap">
                      {String(row[k] ?? "").slice(0, 10)}
                    </td>
                  ))}
                  <td className="text-slate-600">…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Run button */}
      {file && (
        <button onClick={run} disabled={loading}
          className="w-full py-3.5 rounded-xl font-semibold text-white tracking-wide
            bg-indigo-600 hover:bg-indigo-500 active:scale-[.99]
            disabled:opacity-40 disabled:cursor-not-allowed
            shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 transition-all">
          {loading ? "Processing…" : "Run Batch Analysis →"}
        </button>
      )}

      {loading && <Spinner label="Processing all transactions…" />}
      <ErrorMsg msg={error} />

      {/* Summary + download */}
      {summary && (
        <div ref={resultRef}
          style={{ animation: "riseIn .45s cubic-bezier(.22,1,.36,1) both" }}
          className="scroll-mt-6 space-y-4">

          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Total",      value:summary.total_transactions, color:"text-slate-200"  },
              { label:"Fraud",      value:summary.fraud_detected,     color:"text-red-400"    },
              { label:"Legitimate", value:summary.legit_detected,     color:"text-emerald-400"},
            ].map(({ label, value, color }) => (
              <Card key={label} className="p-4 text-center">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</p>
              </Card>
            ))}
          </div>

          <button onClick={() => exportCSV(results)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
              bg-emerald-500/10 border border-emerald-500/25 text-emerald-400
              hover:bg-emerald-500/20 active:scale-[.98] transition-all">
            ⬇ Download Results as CSV
          </button>
        </div>
      )}

      {/* Results table */}
      {results?.length > 0 && (
        <Card className="p-4 overflow-x-auto">
          <Label>Predictions — {results.length} rows</Label>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                <th className="pb-2 pr-4 font-medium">Row</th>
                <th className="pb-2 pr-4 font-medium">Verdict</th>
                <th className="pb-2 pr-4 font-medium">Probability</th>
                <th className="pb-2 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isFraud = r.prediction === 1;
                const pct = (r.fraud_probability * 100).toFixed(1);
                return (
                  <tr key={r.row} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="py-2 pr-4 text-slate-500 text-xs font-mono">#{r.row}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold
                        ${isFraud
                          ? "bg-red-500/15 text-red-400"
                          : "bg-emerald-500/15 text-emerald-400"}`}>
                        {r.label}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-300 text-xs font-mono">{pct}%</td>
                    <td className="py-2 w-32">
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isFraud ? "bg-red-400" : "bg-emerald-400"}`}
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
    { label:"Total Transactions", value:STATS.total.toLocaleString(), color:"text-slate-200"  },
    { label:"Fraud Cases",  value:STATS.fraud.toLocaleString(),  color:"text-red-400",     sub:`${fraudPct}% of total` },
    { label:"Legitimate",   value:STATS.legit.toLocaleString(),  color:"text-emerald-400"  },
    { label:"AUC-ROC",      value:STATS.auc.toFixed(4),          color:"text-indigo-400",  sub:"Higher → better (max 1.0)" },
  ];

  const perfBars = [
    { label:"Precision", value:STATS.precision, color:"bg-indigo-500",
      tip:"Of all flagged fraud, how many were actually fraud." },
    { label:"Recall",    value:STATS.recall,    color:"bg-emerald-500",
      tip:"Of all real fraud cases, how many were caught." },
    { label:"F1 Score",  value:STATS.f1,        color:"bg-violet-500",
      tip:"Harmonic mean of Precision and Recall." },
    { label:"AUC-ROC",   value:STATS.auc,       color:"bg-sky-500",
      tip:"Discrimination ability across all thresholds." },
  ];

  return (
    <div className="space-y-6">

      {/* Info bar */}
      <div className="rounded-xl px-4 py-3 bg-indigo-500/[0.08] border border-indigo-500/20
        text-indigo-400 text-sm">
        Statistics from XGBoost model evaluated on the held-out 20% test set (56,962 transactions).
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4">
        {metrics.map(({ label, value, color, sub }) => (
          <Card key={label} className="p-5">
            <Label>{label}</Label>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
          </Card>
        ))}
      </div>

      {/* Performance bars */}
      <Card className="p-6">
        <Label>Model Performance</Label>
        <div className="space-y-5">
          {perfBars.map(({ label, value, color, tip }) => (
            <div key={label}>
              <div className="flex items-start justify-between mb-1.5">
                <div>
                  <p className="text-sm text-slate-300 font-medium">{label}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">{tip}</p>
                </div>
                <p className="text-lg font-bold text-slate-200 tabular-nums">
                  {(value * 100).toFixed(1)}%
                </p>
              </div>
              <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className={`h-full rounded-full ${color}`}
                  style={{ width: `${(value * 100).toFixed(0)}%`,
                    animation: "expandBar .9s cubic-bezier(.22,1,.36,1) both" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Class distribution */}
      <Card className="p-6">
        <Label>Class Distribution</Label>
        <div className="h-8 rounded-xl overflow-hidden bg-white/[0.05] flex">
          <div
            className="h-full bg-emerald-500/60 flex items-center"
            style={{ width: `${100 - parseFloat(fraudPct)}%` }}>
            <span className="text-[10px] font-semibold text-emerald-200 px-3 truncate">
              Legit {(100 - parseFloat(fraudPct)).toFixed(1)}%
            </span>
          </div>
          {/* Fraud slice is tiny so we enforce a min visible width */}
          <div
            className="h-full bg-red-500/70 flex items-center justify-center"
            style={{ width: `${Math.max(parseFloat(fraudPct), 2)}%` }}>
            <span className="text-[10px] text-red-200">⚠</span>
          </div>
        </div>

        <div className="flex gap-6 mt-3 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
            Legit — {(100 - parseFloat(fraudPct)).toFixed(3)}%
          </span>
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            Fraud — {fraudPct}%
          </span>
        </div>

        <p className="mt-3 text-[10px] text-slate-600">
          Severe imbalance ({(STATS.legit / STATS.fraud).toFixed(0)}:1) mitigated
          via <code className="text-slate-500 bg-white/[0.05] px-1 rounded">scale_pos_weight</code> in XGBoost.
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
  @keyframes riseIn {
    from { opacity:0; transform:translateY(14px) }
    to   { opacity:1; transform:translateY(0)    }
  }
  @keyframes expandBar {
    from { width:0 }
  }
  @keyframes spin {
    to { transform:rotate(360deg) }
  }
`;

export default function App() {
  const [tab, setTab] = useState("single");

  return (
    <div className="min-h-screen bg-[#07090f] text-slate-200 antialiased">
      <style>{KEYFRAMES}</style>

      {/* ── Ambient background ─────────────────────────── */}
      {/* Grid texture */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(#818cf8 1px,transparent 1px)," +
            "linear-gradient(90deg,#818cf8 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }} />
      {/* Glow orbs */}
      <div className="fixed top-[-15%] left-[5%] w-[600px] h-[600px] rounded-full
        bg-indigo-600/[0.07] blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-0 w-[500px] h-[500px] rounded-full
        bg-violet-600/[0.07] blur-[110px] pointer-events-none" />

      {/* ── Header (sticky) ────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.05]
        bg-[#07090f]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 py-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center
            justify-center text-base shadow-lg shadow-indigo-500/30 shrink-0">
            🛡
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-bold text-slate-100 tracking-tight">FraudShield</h1>
            <p className="text-[10px] text-slate-500">Credit Card Fraud Detection · XGBoost</p>
          </div>
          {/* Live badge */}
          <div className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full
            text-[10px] font-semibold text-emerald-400
            bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Model Ready
          </div>
        </div>
      </header>

      {/* ── Tab bar ────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 pt-7">
        <div className="flex gap-1 p-1 bg-white/[0.04] rounded-xl
          border border-white/[0.07] w-fit">
          {TABS.map(({ id, icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm
                font-medium transition-all duration-200
                ${tab === id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"}`}>
              <span className="text-base">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ───────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-6 py-7">
        {tab === "single"    && <SingleTab />}
        {tab === "batch"     && <BatchTab  />}
        {tab === "dashboard" && <DashboardTab />}
      </main>

      {/* ── Footer ─────────────────────────────────────── */}
      <footer className="max-w-3xl mx-auto px-6 py-6 border-t border-white/[0.05]
        text-[10px] text-slate-700 text-center">
        Final Year B.Tech Project · XGBoost + Flask + React ·{" "}
        <code className="text-slate-600">{API_BASE}</code>
      </footer>
    </div>
  );
}