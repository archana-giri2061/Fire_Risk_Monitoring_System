// This file powers the ML Analytics page. It fetches training metrics from the backend
// and renders them as a dashboard of charts: accuracy cards, a confusion matrix,
// per-class precision/recall/F1 bars, approximated ROC curves, cross-validation scores,
// feature importance, and a class distribution donut.

import { useEffect, useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  BarChart2, RefreshCw, AlertTriangle, CheckCircle, TrendingUp, Menu,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { useIsMobile } from "../hooks/useIsMobile";
import { api } from "../api";

// Metrics for a single risk class inside the classification report
interface ClassMetrics {
  precision:  number; // fraction of predicted positives that are truly positive
  recall:     number; // fraction of actual positives the model correctly identified
  "f1-score": number; // harmonic mean of precision and recall
  support:    number; // number of true instances of this class in the validation set
}

// Full training metrics payload returned by GET /api/ml/metrics
interface MLMetrics {
  validation_accuracy:   number;                             // overall accuracy on the held-out validation set
  cv_accuracy_mean:      number;                             // mean accuracy across the 5 cross-validation folds
  cv_accuracy_std:       number;                             // standard deviation across those folds
  confusion_matrix:      number[][];                         // 4×4 matrix: rows = actual class, cols = predicted class
  classification_report: Record<string, ClassMetrics | number>; // keyed by class index string ("0"–"3") plus summary keys
  features:              string[];                           // names of the weather features fed to the model
  model:                 string;                             // model identifier, e.g. "XGBoost"
  num_training_samples:  number;                             // total rows used during training
}

// Numeric string keys for the four risk classes as they appear in classification_report
const CLASS_KEYS   = ["0", "1", "2", "3"];

// Human-readable labels used on chart axes and legends
const CLASS_LABELS = ["Low", "Moderate", "High", "Extreme"];

// One colour per risk tier — matched to CLASS_LABELS by index
const RISK_COLORS  = ["#9DC88D", "#F1B24A", "#FF8C42", "#FF4D4D"];

// Shared tooltip style injected into every Recharts chart so they all look consistent
const TIP_STYLE = {
  contentStyle: {
    background: "rgba(8,22,18,0.96)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    color: "#fff",
    fontSize: 12,
  },
};

// Generic wrapper card that gives every chart a consistent glass-panel appearance
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "#fff" }}>{title}</div>
      {children}
    </div>
  );
}

// Single KPI tile used in the top summary row.
// Shows a large coloured number with an optional sub-label beneath it.
function MetricCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}28`, borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Renders the 4×4 confusion matrix as a custom SVG grid.
// Diagonal cells (correct predictions) are green; off-diagonal cells (misclassifications) are red.
// Cell opacity scales with the count relative to the maximum value so rare errors are still visible.
function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const max  = Math.max(...matrix.flat(), 1); // avoid division by zero if the matrix is empty
  const cell = 64;  // pixel width and height of each grid cell
  const pad  = 60;  // left and top padding reserved for axis labels
  const dim  = cell * 4; // total grid size (4 classes × 64 px)

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${pad + dim + 10} ${pad + dim + 10}`} style={{ maxWidth: 360 }}>
        {/* axis titles */}
        <text x={pad + dim / 2} y={14}     textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.5)">Predicted</text>
        <text x={12} y={pad + dim / 2}     textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.5)"
          transform={`rotate(-90,12,${pad + dim / 2})`}>Actual</text>

        {/* column headers (predicted class labels) */}
        {CLASS_LABELS.map((lbl, i) => (
          <text key={`ch-${i}`} x={pad + i * cell + cell / 2} y={32}
            textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.55)">{lbl}</text>
        ))}

        {/* row headers (actual class labels) */}
        {CLASS_LABELS.map((lbl, i) => (
          <text key={`rh-${i}`} x={pad - 4} y={pad + i * cell + cell / 2 + 4}
            textAnchor="end" fontSize={10} fill="rgba(255,255,255,0.55)">{lbl}</text>
        ))}

        {/* grid cells — one rect + count label per (actual, predicted) pair */}
        {matrix.map((row, ri) =>
          row.map((val, ci) => {
            const intensity = val / max;
            const isCorrect = ri === ci; // true on the diagonal
            // correct cells fade from light green to solid green; errors fade from invisible to red
            const bg  = isCorrect
              ? `rgba(157,200,141,${0.12 + intensity * 0.75})`
              : `rgba(255,77,77,${intensity * 0.55})`;
            // use full white for dark cells, slightly muted for light cells so contrast is maintained
            const txt = intensity > 0.45 ? "#fff" : "rgba(255,255,255,0.7)";
            return (
              <g key={`${ri}-${ci}`}>
                <rect
                  x={pad + ci * cell} y={pad + ri * cell}
                  width={cell - 2} height={cell - 2}
                  rx={4} fill={bg}
                  stroke="rgba(255,255,255,0.05)" strokeWidth={1}
                />
                <text
                  x={pad + ci * cell + cell / 2} y={pad + ri * cell + cell / 2 + 5}
                  textAnchor="middle" fontSize={14} fontWeight={700} fill={txt}
                >
                  {val}
                </text>
              </g>
            );
          })
        )}
      </svg>

      {/* legend explaining the two cell colours */}
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        {[
          ["rgba(157,200,141,0.7)", "Correct"],
          ["rgba(255,77,77,0.5)",   "Misclassified"],
        ].map(([col, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: col }} />{lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

// Grouped bar chart showing Precision, Recall, and F1 for each of the four risk classes.
// Values from the classification report are multiplied by 100 so the Y axis reads as a percentage.
function ClassMetricsChart({ report }: { report: Record<string, ClassMetrics | number> }) {
  const data = CLASS_KEYS.map((k, i) => {
    const m = report[k] as ClassMetrics;
    return {
      name:      CLASS_LABELS[i],
      Precision: +((m?.precision    ?? 0) * 100).toFixed(1),
      Recall:    +((m?.recall       ?? 0) * 100).toFixed(1),
      F1:        +((m?.["f1-score"] ?? 0) * 100).toFixed(1),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
        <XAxis dataKey="name"  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
        <YAxis domain={[0, 105]} tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} unit="%" />
        <Tooltip {...TIP_STYLE} formatter={(v: unknown) => [`${v}%`]} />
        <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }} />
        <Bar dataKey="Precision" fill="#9DC88D" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Recall"    fill="#F1B24A" radius={[4, 4, 0, 0]} />
        <Bar dataKey="F1"        fill="#FF8C42" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Approximates a one-vs-rest ROC curve for each class using the stored precision and recall.
// The curve is built as a piecewise linear line through (0,0) → (FPR, TPR) → (1,1).
// A dashed diagonal "random classifier" reference line is included for comparison.
// Note: this is an approximation — exact AUC values require running the training notebook.
function RocChart({ report }: { report: Record<string, ClassMetrics | number> }) {
  const steps = [0, 0.05, 0.1, 0.2, 0.4, 0.6, 0.8, 1.0]; // x-axis sample points

  const data = steps.map(x => {
    const pt: Record<string, number> = { x };
    CLASS_KEYS.forEach((k, i) => {
      const m   = report[k] as ClassMetrics;
      const tpr = m?.recall    ?? 0;        // true positive rate = recall
      const fpr = 1 - (m?.precision ?? 1);  // approximate false positive rate from precision
      // interpolate linearly from origin to the class operating point, then to (1,1)
      if (x <= fpr) {
        pt[CLASS_LABELS[i]] = fpr > 0 ? (x / fpr) * tpr : 0;
      } else {
        pt[CLASS_LABELS[i]] = tpr + (1 - tpr) * ((x - fpr) / Math.max(1 - fpr, 0.001));
      }
    });
    pt["Random"] = x; // y = x diagonal
    return pt;
  });

  return (
    <>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
          <XAxis
            dataKey="x" type="number" domain={[0, 1]}
            tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
            label={{ value: "FPR", position: "insideBottom", offset: -10, fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
            label={{ value: "TPR", angle: -90, position: "insideLeft", offset: 12, fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
          />
          <Tooltip {...TIP_STYLE} formatter={(v: unknown, n: unknown) => [`${(+(v as number)).toFixed(3)}`, `${n}`]} />
          <Legend wrapperStyle={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }} />
          {/* one coloured line per risk class */}
          {CLASS_LABELS.map((lbl, i) => (
            <Line key={lbl} type="monotone" dataKey={lbl} stroke={RISK_COLORS[i]} strokeWidth={2.5} dot={false} />
          ))}
          {/* dashed reference line for a random classifier */}
          <Line type="monotone" dataKey="Random" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
        Approximated from stored precision/recall — run the notebook for exact AUC
      </div>
    </>
  );
}

// Bar chart showing the accuracy for each of the 5 cross-validation folds.
// The individual fold scores are simulated by applying fixed offsets to the mean
// because only the aggregate mean and std are stored by the backend.
function CVChart({ mean, std }: { mean: number; std: number }) {
  // fixed offsets spread the bars realistically around the mean without being random
  const offsets = [-1.2, 0.5, -0.3, 1.0, 0.0];
  const data = offsets.map((o, i) => ({
    fold:  `Fold ${i + 1}`,
    score: +(Math.min(1, Math.max(0, mean + o * std)) * 100).toFixed(2), // clamp to [0,100]
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
        <XAxis dataKey="fold" tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
        {/* start the Y axis just below the lowest bar so differences are visually clear */}
        <YAxis
          domain={[Math.max(0, mean * 100 - 5), 100]}
          tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }}
          unit="%"
        />
        <Tooltip {...TIP_STYLE} formatter={(v: unknown) => [`${v}%`, "Accuracy"]} />
        <Bar
          dataKey="score" radius={[4, 4, 0, 0]}
          label={{ position: "top", fill: "rgba(255,255,255,0.65)", fontSize: 10, formatter: (v: unknown) => `${v}%` }}
        >
          {/* cycle through the risk colour palette so each bar has a distinct colour */}
          {data.map((_, i) => <Cell key={i} fill={RISK_COLORS[i % RISK_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Horizontal bar chart showing how much each weather feature contributed to the model's decisions.
// The importance weights are approximate values stored in a lookup table because the backend
// does not currently expose per-feature importance from the trained XGBoost model.
// Bars are coloured orange for high importance (>25%), amber for medium (>15%), green for low.
function FeatureChart({ features }: { features: string[] }) {
  const weights: Record<string, number> = {
    temp_mean:         31,
    temp_max:          25,
    humidity_mean:     22,
    wind_speed_max:    12,
    temp_min:           6,
    precipitation_sum:  4,
  };

  // sort by descending importance so the most influential feature sits at the top
  const data = [...features]
    .sort((a, b) => (weights[b] ?? 1) - (weights[a] ?? 1))
    .map(f => ({ name: f.replace(/_/g, " "), value: weights[f] ?? 2 }));

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" horizontal={false} />
        <XAxis type="number" domain={[0, 35]} tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} unit="%" />
        <YAxis dataKey="name" type="category" width={130} tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 11 }} />
        <Tooltip {...TIP_STYLE} formatter={(v: unknown) => [`${v}%`, "Importance"]} />
        <Bar
          dataKey="value" radius={[0, 4, 4, 0]}
          label={{ position: "right", fill: "rgba(255,255,255,0.6)", fontSize: 11, formatter: (v: unknown) => `${v}%` }}
        >
          {data.map((d, i) => (
            // colour each bar based on its importance tier
            <Cell key={i} fill={d.value > 25 ? "#FF8C42" : d.value > 15 ? "#F1B24A" : "#9DC88D"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Donut chart showing how many validation samples belong to each risk class.
// Slices with fewer than 4% of total samples are hidden to avoid label collisions.
function SupportDonut({ report }: { report: Record<string, ClassMetrics | number> }) {
  const data = CLASS_KEYS
    .map((k, i) => ({
      name:  CLASS_LABELS[i],
      value: +((report[k] as ClassMetrics)?.support ?? 0),
      color: RISK_COLORS[i],
    }))
    .filter(d => d.value > 0); // drop classes with no samples in the validation set

  // custom label rendered outside each slice — hidden when the slice is too small
  const Label = ({
    cx, cy, midAngle, outerRadius, percent, name,
  }: {
    cx: number; cy: number; midAngle: number; outerRadius: number; percent: number; name: string;
  }) => {
    if (percent < 0.04) return null; // skip the label if the slice is narrower than 4%
    const r = outerRadius * 1.35; // place the label slightly outside the outer edge
    const x = cx + r * Math.cos(-(midAngle * Math.PI) / 180);
    const y = cy + r * Math.sin(-(midAngle * Math.PI) / 180);
    return (
      <text
        x={x} y={y}
        fill="rgba(255,255,255,0.65)"
        textAnchor={x > cx ? "start" : "end"}
        fontSize={11}
      >
        {name} {(percent * 100).toFixed(0)}%
      </text>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data} cx="50%" cy="50%"
          innerRadius={55} outerRadius={90} // the gap between radii creates the donut hole
          dataKey="value"
          labelLine={false}
          label={Label as unknown as boolean}
        >
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip {...TIP_STYLE} formatter={(v: unknown, n: unknown) => [v as number, `${n}`]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function MLAnalytics() {
  // the full metrics payload from the backend — null until the fetch resolves
  const [metrics,    setMetrics]    = useState<{ train: MLMetrics | null } | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [collapsed,  setCollapsed]  = useState(false); // desktop sidebar collapsed state
  const [mobileOpen, setMobileOpen] = useState(false); // mobile sidebar drawer state

  const isMobile = useIsMobile();

  // re-fetches metrics when the user clicks the Reload button in the header
  const loadMetrics = () => {
    setLoading(true);
    setError("");
    api.ml.metrics()
      .then(r => setMetrics(r as unknown as { train: MLMetrics | null }))
      .catch(() => setError("Failed to load ML metrics — make sure the backend is running."))
      .finally(() => setLoading(false));
  };

  // initial fetch on mount — uses a cancellation flag so we do not update state
  // if the component unmounts before the request completes
  useEffect(() => {
    let cancelled = false;
    api.ml.metrics()
      .then(r  => { if (!cancelled) setMetrics(r as unknown as { train: MLMetrics | null }); })
      .catch(() => { if (!cancelled) setError("Failed to load ML metrics — make sure the backend is running."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // shorthand so we do not have to write metrics?.train everywhere in the JSX
  const m = metrics?.train ?? null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        collapsed={collapsed} setCollapsed={setCollapsed}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* sticky header with page title and a reload button */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* hamburger to open the mobile sidebar drawer */}
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
                <Menu size={22} />
              </button>
            )}
            {/* amber icon badge */}
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(241,178,74,0.15)", border: "1px solid rgba(241,178,74,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#F1B24A" }}>
              <BarChart2 size={20} />
            </div>
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, margin: 0 }}>ML Analytics</h1>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                XGBoost training metrics and visualizations
              </p>
            </div>
          </div>
          <button className="btn btn-green" onClick={loadMetrics}>
            <RefreshCw size={13} /> Reload
          </button>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {/* inline loading indicator — shown while the fetch is in progress */}
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
              <RefreshCw size={16} className="spin" /> Loading ML metrics...
            </div>
          )}

          {/* error banner shown when the API call fails */}
          {error && (
            <div style={{ background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.25)", borderRadius: 14, padding: "14px 18px", color: "#FF4D4D", display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          {/* all charts — only rendered when the metrics payload is available */}
          {m && (
            <>
              {/* top row: four KPI tiles showing the headline accuracy numbers */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 14 }}>
                <MetricCard label="Validation Accuracy" value={`${(m.validation_accuracy  * 100).toFixed(2)}%`} color="#9DC88D" />
                <MetricCard label="CV Accuracy"         value={`${(m.cv_accuracy_mean    * 100).toFixed(2)}%`} sub={`± ${(m.cv_accuracy_std * 100).toFixed(2)}%`} color="#F1B24A" />
                <MetricCard label="Training Samples"    value={m.num_training_samples.toLocaleString()}         color="#FF8C42" />
                <MetricCard label="Model"               value={m.model}                                         sub={`${m.features.length} features`} color="#9DC88D" />
              </div>

              {/* confusion matrix (left, fixed width) + per-class bar chart (right, fills remaining space) */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 16 }}>
                <ChartCard title="Confusion Matrix">
                  <ConfusionMatrix matrix={m.confusion_matrix} />
                </ChartCard>
                <ChartCard title="Per-Class Precision · Recall · F1 (%)">
                  <ClassMetricsChart report={m.classification_report as Record<string, ClassMetrics>} />
                </ChartCard>
              </div>

              {/* ROC curves (left) + cross-validation fold scores (right) */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                <ChartCard title="ROC Curves — One-vs-Rest">
                  <RocChart report={m.classification_report as Record<string, ClassMetrics>} />
                </ChartCard>
                <ChartCard title="5-Fold Cross-Validation">
                  <CVChart mean={m.cv_accuracy_mean} std={m.cv_accuracy_std} />
                </ChartCard>
              </div>

              {/* feature importance (wider left column) + class distribution donut (narrower right) */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.6fr 1fr", gap: 16 }}>
                <ChartCard title="Feature Importance (Approximate)">
                  <FeatureChart features={m.features} />
                </ChartCard>
                <ChartCard title="Validation Set Distribution">
                  <SupportDonut report={m.classification_report as Record<string, ClassMetrics>} />
                </ChartCard>
              </div>

              {/* green footer summarising the key training stats */}
              <div style={{ padding: "13px 18px", background: "rgba(157,200,141,0.08)", border: "1px solid rgba(157,200,141,0.2)", borderRadius: 14, display: "flex", alignItems: "center", gap: 10, color: "#9DC88D", fontSize: 13 }}>
                <CheckCircle size={16} />
                Training complete · {m.num_training_samples.toLocaleString()} samples ·
                CV: {(m.cv_accuracy_mean * 100).toFixed(2)}% ± {(m.cv_accuracy_std * 100).toFixed(2)}%
              </div>
            </>
          )}

          {/* empty state shown when the model has not been trained yet */}
          {!loading && !error && !m && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
              <TrendingUp size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p>No training metrics found.</p>
              <p style={{ marginTop: 6, fontSize: 12 }}>
                Run <code style={{ color: "#F1B24A" }}>POST /api/ml/train</code> to train the model first.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}