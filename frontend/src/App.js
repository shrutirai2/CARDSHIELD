// ================================================================
// App.js — CARDSHIELD: Credit Card Fraud Detection Frontend
// React 18 + Tailwind CSS | Premium Dark Cyber-Finance Theme
// Backend: Flask at https://cardshield-backend.onrender.com
// ================================================================

import { useState, useRef, useCallback, useEffect } from "react";
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
  try { res = await fetch(`${API_BASE}${endpoint}`, payload); }
  catch { throw new Error("BACKEND_DOWN"); }
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
    <div className={`cs-card ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="cs-section-label">
      {children}
    </p>
  );
}

function FieldInput({ name, value, onChange, placeholder = "0.000", large }) {
  return (
    <div className="cs-field-group">
      <label className={`cs-field-label ${large ? "cs-field-label--large" : ""}`}>
        {name}
      </label>
      <input
        name={name}
        value={value}
        onChange={onChange}
        type="number"
        step="any"
        placeholder={placeholder}
        className={`cs-input ${large ? "cs-input--large" : ""}`}
      />
    </div>
  );
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  const isDown = msg === "BACKEND_DOWN";
  return (
    <div className={`cs-error-msg ${isDown ? "cs-error-msg--warn" : "cs-error-msg--danger"}`}>
      {isDown ? (
        <>
          <p className="cs-error-title">⚠ Cannot reach Flask backend</p>
          <p className="cs-error-sub">
            Run <code>python app.py</code> then refresh. Expected at{" "}
            <code>{API_BASE}</code>
          </p>
        </>
      ) : (
        <p><span className="cs-error-title">Error — </span>{msg}</p>
      )}
    </div>
  );
}

function Spinner({ label = "Analysing…" }) {
  return (
    <div className="cs-spinner">
      <span className="cs-spinner-ring" />
      {label}
    </div>
  );
}

function Verdict({ result, innerRef }) {
  if (!result) return null;
  const fraud = result.prediction === 1;
  const pct   = (result.fraud_probability * 100).toFixed(2);
  return (
    <div ref={innerRef} className={`cs-verdict ${fraud ? "cs-verdict--fraud" : "cs-verdict--legit"} scroll-mt-6`}>
      <div className="cs-verdict-icon">{fraud ? "⚠️" : "✅"}</div>
      <div className="cs-verdict-body">
        <p className={`cs-verdict-title ${fraud ? "cs-verdict-title--fraud" : "cs-verdict-title--legit"}`}>
          {fraud ? "Fraud Detected" : "Legitimate Transaction"}
        </p>
        <p className="cs-verdict-sub">
          Fraud probability: <span className="cs-verdict-prob">{pct}%</span>
        </p>
        <div className="cs-verdict-bar-bg">
          <div
            className={`cs-verdict-bar ${fraud ? "cs-verdict-bar--fraud" : "cs-verdict-bar--legit"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className={`cs-verdict-pct ${fraud ? "cs-verdict-pct--fraud" : "cs-verdict-pct--legit"}`}>
        {pct}%
      </p>
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

  const onChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const load = (sample) => { setForm(sample); setResult(null); setError(null); setVOpen(false); };
  const reset = () => { setForm(EMPTY_FORM); setResult(null); setError(null); setVOpen(false); };

  const submit = async () => {
    const missing = FEATURE_COLS.filter((f) => form[f] === "");
    if (missing.length) {
      setError(`Fill in: ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? " …" : ""}`);
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const data = await predictSingle(form);
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cs-tab-content">
      {/* Sample loader */}
      <div className="cs-sample-row">
        <button onClick={() => load(SAMPLE_FRAUD)} className="cs-btn cs-btn--fraud">
          <span>⚠</span> Load Fraud Sample
        </button>
        <button onClick={() => load(SAMPLE_LEGIT)} className="cs-btn cs-btn--legit">
          <span>✓</span> Load Legit Sample
        </button>
        <button onClick={reset} className="cs-btn cs-btn--ghost">
          ↺ Reset
        </button>
      </div>

      {/* Time & Amount */}
      <Card className="cs-card-padded">
        <SectionLabel>Transaction Details</SectionLabel>
        <div className="cs-two-col">
          <FieldInput name="Time"   value={form.Time}   onChange={onChange} placeholder="e.g. 0"      large />
          <FieldInput name="Amount" value={form.Amount} onChange={onChange} placeholder="e.g. 149.62" large />
        </div>
        <p className="cs-hint">
          <code>Time</code> = seconds since first transaction ·{" "}
          <code>Amount</code> = transaction value (USD)
        </p>
      </Card>

      {/* V1–V28 collapsible */}
      <Card className="cs-card-overflow">
        <button onClick={() => setVOpen((v) => !v)} className="cs-collapsible-btn">
          <span className="cs-collapsible-title">
            <SectionLabel>PCA Features&nbsp;</SectionLabel>
            <span className="cs-badge">V1 – V28</span>
          </span>
          <span className={`cs-chevron ${vOpen ? "cs-chevron--open" : ""}`}>▼</span>
        </button>
        <div className="cs-collapsible-body" style={{ maxHeight: vOpen ? "1000px" : "0", opacity: vOpen ? 1 : 0 }}>
          <div className="cs-collapsible-inner">
            <p className="cs-hint cs-mb-4">PCA-transformed anonymised features. Pre-filled when using sample data.</p>
            <div className="cs-v-grid">
              {V_FIELDS.map((f) => (
                <FieldInput key={f} name={f} value={form[f]} onChange={onChange} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <button onClick={submit} disabled={loading} className="cs-btn cs-btn--primary cs-btn--full">
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
    Papa.parse(f, { header:true, skipEmptyLines:true, preview:5, complete:(r) => setPreview(r.data) });

  const accept = (f) => {
    if (!f?.name?.endsWith(".csv")) { setError("Upload a .csv file."); return; }
    setFile(f); setError(null); setResults(null); setSummary(null); parsePreview(f);
  };

  const onDrop = useCallback((e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files[0]); }, []);
  const remove = (e) => { e.stopPropagation(); setFile(null); setPreview(null); setResults(null); setSummary(null); setError(null); };

  const run = async () => {
    if (!file) return;
    setLoading(true); setError(null);
    try {
      const data = await predictBatch(file);
      setResults(data.results);
      setSummary(data.summary);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const previewCols = preview?.[0] ? Object.keys(preview[0]).slice(0, 7) : [];

  return (
    <div className="cs-tab-content">
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onClick={() => fileRef.current.click()}
        className={`cs-dropzone ${drag ? "cs-dropzone--active" : ""}`}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => accept(e.target.files[0])} />
        <div className="cs-dropzone-icon">{file ? "📄" : "📂"}</div>
        <p className="cs-dropzone-title">{file ? file.name : "Drop CSV here or click to browse"}</p>
        <p className="cs-dropzone-sub">Required columns: Time, V1–V28, Amount · Class column is ignored</p>
        {file && (
          <div className="cs-dropzone-meta">
            <span className="cs-dropzone-size">{(file.size / 1024).toFixed(1)} KB</span>
            <button onClick={remove} className="cs-dropzone-remove">✕ Remove</button>
          </div>
        )}
      </div>

      {preview && (
        <Card className="cs-card-padded cs-overflow-x">
          <SectionLabel>Preview — first 5 rows</SectionLabel>
          <table className="cs-table">
            <thead>
              <tr>
                {previewCols.map((k) => <th key={k} className="cs-th">{k}</th>)}
                <th className="cs-th-ellipsis">…</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} className="cs-tr">
                  {previewCols.map((k) => <td key={k} className="cs-td">{String(row[k] ?? "").slice(0, 10)}</td>)}
                  <td className="cs-td-ellipsis">…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {file && (
        <button onClick={run} disabled={loading} className="cs-btn cs-btn--primary cs-btn--full">
          {loading ? "Processing…" : "Run Batch Analysis →"}
        </button>
      )}

      {loading && <Spinner label="Processing all transactions…" />}
      <ErrorMsg msg={error} />

      {summary && (
        <div ref={resultRef} className="cs-summary-section">
          <div className="cs-summary-grid">
            {[
              { label:"Total",      value:summary.total_transactions, cls:"cs-summary-val"         },
              { label:"Fraud",      value:summary.fraud_detected,     cls:"cs-summary-val--fraud"  },
              { label:"Legitimate", value:summary.legit_detected,     cls:"cs-summary-val--legit"  },
            ].map(({ label, value, cls }) => (
              <Card key={label} className="cs-card-padded cs-text-center">
                <p className="cs-section-label">{label}</p>
                <p className={`cs-summary-num ${cls}`}>{value.toLocaleString()}</p>
              </Card>
            ))}
          </div>
          <button onClick={() => exportCSV(results)} className="cs-btn cs-btn--legit">
            ⬇ Download Results as CSV
          </button>
        </div>
      )}

      {results?.length > 0 && (
        <Card className="cs-card-padded cs-overflow-x">
          <SectionLabel>Predictions — {results.length} rows</SectionLabel>
          <table className="cs-table">
            <thead>
              <tr>
                {["Row","Verdict","Probability","Confidence"].map((h) => (
                  <th key={h} className="cs-th">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isFraud = r.prediction === 1;
                const pct = (r.fraud_probability * 100).toFixed(1);
                return (
                  <tr key={r.row} className="cs-tr">
                    <td className="cs-td cs-td-mono">#{r.row}</td>
                    <td className="cs-td">
                      <span className={`cs-tag ${isFraud ? "cs-tag--fraud" : "cs-tag--legit"}`}>{r.label}</span>
                    </td>
                    <td className="cs-td cs-td-mono">{pct}%</td>
                    <td className="cs-td cs-td-bar">
                      <div className="cs-bar-bg">
                        <div className={`cs-bar ${isFraud ? "cs-bar--fraud" : "cs-bar--legit"}`}
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
    { label:"Total Transactions", value:STATS.total.toLocaleString(), cls:"cs-metric-val"         },
    { label:"Fraud Cases",  value:STATS.fraud.toLocaleString(),  cls:"cs-metric-val--fraud",  sub:`${fraudPct}% of total` },
    { label:"Legitimate",   value:STATS.legit.toLocaleString(),  cls:"cs-metric-val--legit"   },
    { label:"AUC-ROC",      value:STATS.auc.toFixed(4),          cls:"cs-metric-val--auc",    sub:"Higher → better (max 1.0)" },
  ];

  const perfBars = [
    { label:"Precision", value:STATS.precision, cls:"cs-perf-bar--indigo",  tip:"Of all flagged fraud, how many were actually fraud." },
    { label:"Recall",    value:STATS.recall,    cls:"cs-perf-bar--emerald", tip:"Of all real fraud cases, how many were caught." },
    { label:"F1 Score",  value:STATS.f1,        cls:"cs-perf-bar--violet",  tip:"Harmonic mean of Precision and Recall." },
    { label:"AUC-ROC",   value:STATS.auc,       cls:"cs-perf-bar--sky",     tip:"Discrimination ability across all thresholds." },
  ];

  return (
    <div className="cs-tab-content">
      <div className="cs-info-bar">
        Statistics from XGBoost model evaluated on the held-out 20% test set (56,962 transactions).
      </div>

      <div className="cs-metrics-grid">
        {metrics.map(({ label, value, cls, sub }) => (
          <Card key={label} className="cs-card-padded">
            <SectionLabel>{label}</SectionLabel>
            <p className={`cs-metric-num ${cls}`}>{value}</p>
            {sub && <p className="cs-metric-sub">{sub}</p>}
          </Card>
        ))}
      </div>

      <Card className="cs-card-padded">
        <SectionLabel>Model Performance</SectionLabel>
        <div className="cs-perf-list">
          {perfBars.map(({ label, value, cls, tip }) => (
            <div key={label} className="cs-perf-item">
              <div className="cs-perf-header">
                <div>
                  <p className="cs-perf-label">{label}</p>
                  <p className="cs-perf-tip">{tip}</p>
                </div>
                <p className="cs-perf-pct">{(value * 100).toFixed(1)}%</p>
              </div>
              <div className="cs-perf-bar-bg">
                <div className={`cs-perf-bar ${cls}`}
                  style={{ width: `${(value * 100).toFixed(0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="cs-card-padded">
        <SectionLabel>Class Distribution</SectionLabel>
        <div className="cs-dist-bar">
          <div className="cs-dist-legit" style={{ width: `${100 - parseFloat(fraudPct)}%` }}>
            <span className="cs-dist-label">Legit {(100 - parseFloat(fraudPct)).toFixed(1)}%</span>
          </div>
          <div className="cs-dist-fraud" style={{ width: `${Math.max(parseFloat(fraudPct), 2)}%` }}>
            <span className="cs-dist-label">⚠</span>
          </div>
        </div>
        <div className="cs-dist-legend">
          <span className="cs-dist-dot cs-dist-dot--legit" />
          Legit — {(100 - parseFloat(fraudPct)).toFixed(3)}%
          <span className="cs-dist-dot cs-dist-dot--fraud" style={{ marginLeft: "1.5rem" }} />
          Fraud — {fraudPct}%
        </div>
        <p className="cs-hint cs-mt-3">
          Severe imbalance ({(STATS.legit / STATS.fraud).toFixed(0)}:1) mitigated
          via <code>scale_pos_weight</code> in XGBoost.
        </p>
      </Card>
    </div>
  );
}

// ================================================================
// ANIMATED COUNTER
// ================================================================
function AnimatedNumber({ target, duration = 1600 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setDisplay(start);
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <>{display.toLocaleString()}</>;
}

// ================================================================
// HERO STATS BAR
// ================================================================
function HeroStats() {
  const stats = [
    { value: 284807, label: "TRANSACTIONS" },
    { value: 9812,   label: "AUC SCORE", display: "98.1%" },
    { value: 492,    label: "FRAUD CASES" },
    { value: null,   label: "ALGORITHM", display: "XGBoost" },
  ];
  return (
    <div className="cs-hero-stats">
      {stats.map(({ value, label, display }) => (
        <div key={label} className="cs-hero-stat">
          <p className="cs-hero-stat-val">
            {display ?? <AnimatedNumber target={value} />}
          </p>
          <p className="cs-hero-stat-label">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ================================================================
// TABS CONFIG
// ================================================================
const TABS = [
  { id:"single",    icon:"🔍", label:"Single Transaction", sub:"Analyse one transaction" },
  { id:"batch",     icon:"📦", label:"Batch Upload",        sub:"Upload CSV file"         },
  { id:"dashboard", icon:"📊", label:"Dashboard",           sub:"Model performance"       },
];

// ================================================================
// ROOT — App Shell
// ================================================================
export default function App() {
  const [tab, setTab] = useState("single");

  return (
    <div className="cs-root">

      {/* ── Hero Header ────────────────────────────── */}
      <header className="cs-hero">
        <div className="cs-hero-bg" />
        <div className="cs-hero-grid" />
        <div className="cs-hero-glow cs-hero-glow--1" />
        <div className="cs-hero-glow cs-hero-glow--2" />

        <div className="cs-hero-inner">
          {/* Badge */}
          <div className="cs-hero-badge">
            <span className="cs-hero-badge-dot" />
            AI-POWERED SECURITY
          </div>

          {/* Wordmark */}
          <div className="cs-wordmark-wrap">
            <div className="cs-wordmark-shield">🛡</div>
            <div>
              <h1 className="cs-wordmark">
                <span className="cs-wordmark-card">CARD</span>
                <span className="cs-wordmark-shield-text">SHIELD</span>
              </h1>
              <p className="cs-tagline">Real-time fraud detection powered by XGBoost</p>
            </div>
          </div>

          {/* Stats */}
          <HeroStats />
        </div>
      </header>

      {/* ── Sticky Tab Nav ─────────────────────────── */}
      <nav className="cs-nav">
        <div className="cs-nav-inner">
          <div className="cs-tabs">
            {TABS.map(({ id, icon, label, sub }) => (
              <button key={id} onClick={() => setTab(id)}
                className={`cs-tab ${tab === id ? "cs-tab--active" : ""}`}>
                <span className="cs-tab-icon">{icon}</span>
                <span className="cs-tab-text">
                  <span className="cs-tab-label">{label}</span>
                  <span className="cs-tab-sub">{sub}</span>
                </span>
                {tab === id && <span className="cs-tab-indicator" />}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Main ───────────────────────────────────── */}
      <main className="cs-main">
        {tab === "single"    && <SingleTab />}
        {tab === "batch"     && <BatchTab  />}
        {tab === "dashboard" && <DashboardTab />}
      </main>

      {/* ── Footer ─────────────────────────────────── */}
      <footer className="cs-footer">
        <p>Final Year B.Tech Project · XGBoost + Flask + React</p>
        <p><code>{API_BASE}</code></p>
      </footer>
    </div>
  );
}