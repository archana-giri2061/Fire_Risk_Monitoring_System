import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell, BellOff, BellRing, CheckCircle, AlertTriangle,
  RefreshCw, Send, Mail, Flame, Clock, MapPin,
  LayoutDashboard, CalendarDays, Wifi, Activity,
  Menu, X, Zap, Shield,  ChevronDown, ChevronUp,
  Volume2, VolumeX,
} from "lucide-react";
import logo from "../assets/logo.png";

const API = "http://localhost:3000";

const RISK_COLOR: Record<string, string> = {
  Low: "#9DC88D", Moderate: "#F1B24A", High: "#ff8c42", Extreme: "#ff4d4d",
};
const RISK_BG: Record<string, string> = {
  Low: "rgba(157,200,141,0.15)", Moderate: "rgba(241,178,74,0.15)",
  High: "rgba(255,140,66,0.15)", Extreme: "rgba(255,77,77,0.15)",
};
const RISK_ICON: Record<string, string> = {
  Low: "🟢", Moderate: "🟡", High: "🟠", Extreme: "🔴",
};

interface AlertLog {
  id: number;
  location_key: string;
  risk_label: string;
  alert_date: string;
  message: string;
  created_at: string;
}
interface Prediction {
  date: string;
  risk_label: string;
  risk_probability: number;
}

// ── Sound engine ───────────────────────────────────────────────────────────
function createAudioCtx(): AudioContext | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); }
  catch { return null; }
}
function playTone(ctx: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number, start = 0) {
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}
function playRiskSound(risk: string) {
  const ctx = createAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  if (risk === "Extreme") {
    [0, 0.22, 0.44, 0.66, 0.88, 1.1].forEach((t, i) =>
      playTone(ctx, i % 2 === 0 ? 1400 : 900, 0.18, "square", 0.75, t));
  } else if (risk === "High") {
    playTone(ctx, 520, 0.3, "sawtooth", 0.6, 0);
    playTone(ctx, 780, 0.4, "sawtooth", 0.7, 0.4);
    playTone(ctx, 520, 0.3, "sawtooth", 0.6, 0.9);
    playTone(ctx, 780, 0.4, "sawtooth", 0.7, 1.3);
  } else if (risk === "Moderate") {
    playTone(ctx, 440, 0.25, "sine", 0.45, 0);
    playTone(ctx, 550, 0.35, "sine", 0.45, 0.3);
  } else {
    playTone(ctx, 660, 0.4, "sine", 0.3, 0);
  }
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const loc = useLocation();
  const links = [
    { to: "/home",     icon: <LayoutDashboard size={18} />, label: "Dashboard"   },
    { to: "/forecast", icon: <CalendarDays size={18} />,    label: "Forecast"    },
    { to: "/iot",      icon: <Wifi size={18} />,            label: "IoT Monitor" },
    { to: "/alerts",   icon: <Bell size={18} />,            label: "Alerts"      },
    { to: "/",         icon: <Activity size={18} />,        label: "Home"        },
  ];
  return (
    <aside style={{ width: collapsed ? 68 : 220, minHeight: "100vh", flexShrink: 0, background: "rgba(8,22,18,0.85)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", transition: "width 0.3s ease", overflow: "hidden", position: "sticky", top: 0, alignSelf: "flex-start" }}>
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <img src={logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        {!collapsed && <div><div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>वन दृष्टि</div><div style={{ fontSize: 10, color: "#9DC88D", letterSpacing: 0.8 }}>Fire Monitor</div></div>}
      </div>
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {links.map(lk => {
          const active = loc.pathname === lk.to;
          return (
            <Link key={lk.to} to={lk.to} style={{ display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "12px 0" : "12px 14px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 14, background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent", border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent", color: active ? "#F1B24A" : "rgba(255,255,255,0.58)", fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: "none", transition: "all 0.2s" }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >{lk.icon}{!collapsed && <span>{lk.label}</span>}</Link>
          );
        })}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} style={{ margin: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

// ── Toast ──────────────────────────────────────────────────────────────────
interface Toast { id: number; msg: string; type: "success" | "error" | "info" }
function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 80, right: 24, zIndex: 999, display: "flex", flexDirection: "column", gap: 10 }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: "14px 20px", borderRadius: 14, minWidth: 280, display: "flex", alignItems: "center", gap: 12, background: t.type === "success" ? "rgba(157,200,141,0.18)" : t.type === "error" ? "rgba(255,77,77,0.18)" : "rgba(241,178,74,0.18)", border: `1px solid ${t.type === "success" ? "rgba(157,200,141,0.4)" : t.type === "error" ? "rgba(255,77,77,0.4)" : "rgba(241,178,74,0.4)"}`, backdropFilter: "blur(14px)", color: "#fff", fontSize: 13, animation: "slideIn 0.25s ease" }}>
          {t.type === "success" ? <CheckCircle size={16} color="#9DC88D" /> : t.type === "error" ? <AlertTriangle size={16} color="#ff4d4d" /> : <Bell size={16} color="#F1B24A" />}
          <span style={{ flex: 1 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Alerts() {
  const [history, setHistory]     = useState<AlertLog[]>([]);
  const [preds, setPreds]         = useState<Prediction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toasts, setToasts]       = useState<Toast[]>([]);
  const [sending, setSending]     = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const toastId = useRef(0);

  const addToast = useCallback((msg: string, type: Toast["type"] = "info") => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const fetchData = async () => {
    try {
      const [histRes, predRes] = await Promise.all([
        fetch(`${API}/api/alerts/history?limit=50`),
        fetch(`${API}/api/ml/predictions?limit=7`),
      ]);
      if (histRes.ok) { const h = await histRes.json(); setHistory(h.data || []); }
      if (predRes.ok) { const p = await predRes.json(); setPreds(p.data || []); }
      setLastRefresh(new Date().toLocaleTimeString());
    } catch { addToast("Failed to fetch — check backend", "error"); }
    finally { setLoading(false); }
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const sendAlert = async (minRisk: "High" | "Extreme", label: string) => {
    setSending(label);
    try {
      const res  = await fetch(`${API}/api/alerts/run-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minRisk }) });
      const data = await res.json();
      if (data.sent) {
        addToast(`✅ ${label} alert sent — ${data.alerts} day(s) flagged`, "success");
        if (soundEnabled) playRiskSound(minRisk);
        await fetchData();
      } else {
        addToast(`ℹ️ ${data.message}`, "info");
      }
    } catch { addToast(`Failed to send ${label} alert`, "error"); }
    finally { setSending(null); }
  };

  const sendTestEmail = async () => {
    setSending("test");
    try {
      const res = await fetch(`${API}/api/alerts/test-email`, { method: "POST" });
      const data = await res.json();
      if (data.ok) { addToast("Test email sent — check your inbox", "success"); if (soundEnabled) playRiskSound("Low"); }
      else throw new Error(data.error);
    } catch { addToast("Test email failed — check SMTP config", "error"); }
    finally { setSending(null); }
  };

  const sendTestExtreme = async () => {
    setSending("test-extreme");
    try {
      const res = await fetch(`${API}/api/alerts/test-extreme`, { method: "POST" });
      const data = await res.json();
      if (data.ok) { addToast("🔴 Test EXTREME alert sent!", "success"); if (soundEnabled) playRiskSound("Extreme"); }
      else throw new Error(data.error);
    } catch { addToast("Test extreme email failed", "error"); }
    finally { setSending(null); }
  };

  const sendDailyReport = async () => {
    setSending("daily");
    try {
      const res = await fetch(`${API}/api/alerts/daily-report`, { method: "POST" });
      const data = await res.json();
      if (data.ok && data.sent) {
        addToast(`Daily report sent — risk: ${data.riskLevel}`, "success");
        if (soundEnabled) playRiskSound(data.riskLevel ?? "Low");
      } else {
        addToast(data.message ?? "No predictions available", "info");
      }
    } catch { addToast("Daily report failed", "error"); }
    finally { setSending(null); }
  };

  const worstPred   = preds.find(p => p.risk_label === "Extreme") ?? preds.find(p => p.risk_label === "High");
  const extremeDays = preds.filter(p => p.risk_label === "Extreme").length;
  const highDays    = preds.filter(p => p.risk_label === "High").length;
  const alertsToday = history.filter(h => h.alert_date === new Date().toISOString().slice(0, 10)).length;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "22px", ...extra,
  });
  const btn = (color: string, disabled = false): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", borderRadius: 999,
    background: disabled ? `${color}08` : `${color}18`, border: `1px solid ${color}35`,
    color: disabled ? `${color}60` : color, fontWeight: 700, fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.2s", whiteSpace: "nowrap" as const,
  });

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading alerts…</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <ToastList toasts={toasts} remove={id => setToasts(prev => prev.filter(t => t.id !== id))} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>Alert Center</h1>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={11} /> Lumbini Forest Zone &nbsp;·&nbsp; <Clock size={11} /> {lastRefresh || "Loading…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setSoundEnabled(s => !s)} style={{ ...btn(soundEnabled ? "#9DC88D" : "#888"), padding: "9px 14px" }}>
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {soundEnabled ? "Sound On" : "Sound Off"}
            </button>
            <button onClick={fetchData} style={btn("#9DC88D")}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>

          {/* Extreme/High banner */}
          {worstPred && (
            <div style={{ padding: "18px 24px", borderRadius: 18, background: RISK_BG[worstPred.risk_label], border: `2px solid ${RISK_COLOR[worstPred.risk_label]}50`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, animation: worstPred.risk_label === "Extreme" ? "pulseBox 2s ease-in-out infinite" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: `${RISK_COLOR[worstPred.risk_label]}20`, border: `1px solid ${RISK_COLOR[worstPred.risk_label]}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Flame size={26} color={RISK_COLOR[worstPred.risk_label]} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: RISK_COLOR[worstPred.risk_label] }}>
                    {RISK_ICON[worstPred.risk_label]} {worstPred.risk_label} Risk Detected
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                    {worstPred.date} · Confidence: {Math.round(worstPred.risk_probability * 100)}%
                    {worstPred.risk_label === "Extreme" && " · Immediate action required"}
                  </div>
                </div>
              </div>
              <button onClick={() => sendAlert(worstPred.risk_label === "Extreme" ? "Extreme" : "High", worstPred.risk_label)} disabled={!!sending} style={{ ...btn(RISK_COLOR[worstPred.risk_label], !!sending), padding: "12px 22px", fontSize: 14 }}>
                <BellRing size={15} style={{ animation: sending ? "spin 1s linear infinite" : "none" }} />
                {sending ? "Sending…" : `Send ${worstPred.risk_label} Alert Now`}
              </button>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            {[
              { label: "Total Alerts Sent", val: history.length,  color: "#60a5fa", icon: <Bell size={20} /> },
              { label: "Alerts Today",      val: alertsToday,     color: "#F1B24A", icon: <Clock size={20} /> },
              { label: "Extreme Risk Days", val: extremeDays,     color: "#ff4d4d", icon: <Flame size={20} /> },
              { label: "High Risk Days",    val: highDays,        color: "#ff8c42", icon: <AlertTriangle size={20} /> },
            ].map(s => (
              <div key={s.label} style={{ ...card(), border: `1px solid ${s.val > 0 && (s.color === "#ff4d4d" || s.color === "#ff8c42") ? s.color + "35" : "rgba(255,255,255,0.09)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 13, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color }}>{s.icon}</div>
                  {s.val > 0 && s.color === "#ff4d4d" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff4d4d", animation: "pulse 1.5s infinite", display: "block", marginTop: 6 }} />}
                </div>
                <div style={{ fontSize: 30, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 5, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions + Sound tester */}
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
            <div style={card()}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 18 }}>Send Alert Notifications</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  { color: "#ff8c42", title: "🔶 High Risk Alert",        desc: "Emails when High or Extreme risk detected in forecast", key: "High",         action: () => sendAlert("High", "High") },
                  { color: "#ff4d4d", title: "🔴 Extreme Risk Only",      desc: "Emails only when Extreme risk days exist in forecast",   key: "Extreme",      action: () => sendAlert("Extreme", "Extreme") },
                  { color: "#60a5fa", title: "📋 Daily Report (All)",     desc: "Full 7-day report covering Low, Moderate, High, Extreme", key: "daily",       action: sendDailyReport },
                ].map(item => (
                  <div key={item.key} style={{ padding: "16px 18px", borderRadius: 16, background: `${item.color}08`, border: `1px solid ${item.color}22`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.color, marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{item.desc}</div>
                    </div>
                    <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                      <Send size={13} style={{ animation: sending === item.key ? "spin 1s linear infinite" : "none" }} />
                      {sending === item.key ? "Sending…" : "Send Now"}
                    </button>
                  </div>
                ))}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Testing & Diagnostics</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { color: "#9DC88D", title: "✅ SMTP Smoke Test",    desc: "Sends plain test email to verify SMTP is working", key: "test",         action: sendTestEmail,  icon: <Mail size={13} /> },
                      { color: "#ff4d4d", title: "🔴 Fake Extreme Alert", desc: "Test Extreme alert with mock data — no DB needed",  key: "test-extreme", action: sendTestExtreme, icon: <Zap size={13} /> },
                    ].map(item => (
                      <div key={item.key} style={{ padding: "14px 18px", borderRadius: 14, background: `${item.color}07`, border: `1px solid ${item.color}20`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.title}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{item.desc}</div>
                        </div>
                        <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                          {item.icon} {sending === item.key ? "Sending…" : "Run Test"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Sound tester */}
              <div style={card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Sound Alert Preview</div>
                  <button onClick={() => setSoundEnabled(s => !s)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: soundEnabled ? "rgba(157,200,141,0.12)" : "rgba(100,100,100,0.12)", border: `1px solid ${soundEnabled ? "rgba(157,200,141,0.3)" : "rgba(100,100,100,0.3)"}`, color: soundEnabled ? "#9DC88D" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {soundEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    {soundEnabled ? "On" : "Off"}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", marginBottom: 12 }}>Click to preview each risk level's alarm sound.</div>
                {["Extreme", "High", "Moderate", "Low"].map(risk => (
                  <button key={risk} onClick={() => { if (soundEnabled) playRiskSound(risk); }} disabled={!soundEnabled}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 13, width: "100%", background: `${RISK_COLOR[risk]}10`, border: `1px solid ${RISK_COLOR[risk]}28`, cursor: soundEnabled ? "pointer" : "not-allowed", opacity: soundEnabled ? 1 : 0.5, marginBottom: 8, transition: "all 0.2s" }}
                    onMouseEnter={e => { if (soundEnabled) (e.currentTarget as HTMLButtonElement).style.background = `${RISK_COLOR[risk]}20`; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${RISK_COLOR[risk]}10`; }}
                  >
                    <span style={{ fontSize: 15 }}>{RISK_ICON[risk]}</span>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: RISK_COLOR[risk] }}>{risk}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                        {risk === "Extreme" ? "6-burst urgent alarm" : risk === "High" ? "Double sawtooth warning" : risk === "Moderate" ? "Ascending double chime" : "Gentle single ping"}
                      </div>
                    </div>
                    <Volume2 size={13} color={RISK_COLOR[risk]} style={{ opacity: 0.6 }} />
                  </button>
                ))}
              </div>

              {/* Config status */}
              <div style={card()}>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Email Config</div>
                {[
                  { label: "SMTP",         val: "smtp.gmail.com",        color: "#9DC88D", icon: <Shield size={13} /> },
                  { label: "Auto Alert",   val: "High & Extreme only",   color: "#ff8c42", icon: <BellRing size={13} /> },
                  { label: "Daily Report", val: "Every day at 10:35 AM", color: "#60a5fa", icon: <Clock size={13} /> },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: item.color }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{item.val}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "rgba(157,200,141,0.07)", border: "1px solid rgba(157,200,141,0.2)", fontSize: 12, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle size={13} color="#9DC88D" /> Run SMTP Smoke Test to verify delivery.
                </div>
              </div>

              {/* 7-day mini */}
              {preds.length > 0 && (
                <div style={card()}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>7-Day Risk</div>
                  {preds.slice(0, 7).map((p, i) => {
                    const col = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                    const pct = Math.round(p.risk_probability * 100);
                    const day = new Date(p.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 76, flexShrink: 0 }}>{day}</div>
                        <div style={{ flex: 1, height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 999, transition: "width 0.8s ease" }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: col, width: 68, textAlign: "right", flexShrink: 0 }}>{RISK_ICON[p.risk_label]} {p.risk_label}</span>
                      </div>
                    );
                  })}
                  <Link to="/forecast" style={{ display: "block", marginTop: 10, textAlign: "center", fontSize: 12, color: "#F1B24A", fontWeight: 700, textDecoration: "none", padding: "7px", borderRadius: 10, background: "rgba(241,178,74,0.08)", border: "1px solid rgba(241,178,74,0.2)" }}>
                    Full Forecast →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Alert history */}
          <div style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Alert History</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "4px 12px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {history.length} record{history.length !== 1 ? "s" : ""}
              </span>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(157,200,141,0.1)", border: "1px solid rgba(157,200,141,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BellOff size={24} color="#9DC88D" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#9DC88D" }}>No alerts sent yet</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>Alerts appear here automatically when High or Extreme risk is detected</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((row, i) => {
                  const col      = RISK_COLOR[row.risk_label] ?? "#9DC88D";
                  const expanded = expandedLog === i;
                  return (
                    <div key={i} style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${expanded ? col + "35" : "rgba(255,255,255,0.07)"}`, overflow: "hidden", transition: "border-color 0.2s" }}>
                      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setExpandedLog(expanded ? null : i)}>
                        <span style={{ padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30`, flexShrink: 0 }}>
                          {RISK_ICON[row.risk_label]} {row.risk_label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.message}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{row.location_key}</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{row.alert_date}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{new Date(row.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
                      </div>
                      {expanded && (
                        <div style={{ padding: "0 18px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ paddingTop: 14, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                            {[
                              { label: "Alert ID",   val: `#${row.id}` },
                              { label: "Location",   val: row.location_key },
                              { label: "Alert Date", val: row.alert_date },
                              { label: "Risk Level", val: row.risk_label },
                              { label: "Sent At",    val: new Date(row.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
                            ].map(f => (
                              <div key={f.label} style={{ padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{f.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{f.val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }
        @keyframes pulseBox{ 0%,100%{border-color:rgba(255,77,77,0.5)} 50%{border-color:rgba(255,77,77,0.15)} }
        @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
      `}</style>
    </div>
  );
}