import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell, BellOff, BellRing, CheckCircle, AlertTriangle,
  RefreshCw, Send, Mail, Flame, Clock, MapPin,
  LayoutDashboard, CalendarDays, Wifi, Activity,
  Menu, X, Zap, Shield, ChevronDown, ChevronUp,
  Volume2, VolumeX,
} from "lucide-react";
import logo from "../assets/logo.png";

import { API_BASE_URL as API } from "../api/config";

const RISK_COLOR: Record<string, string> = { Low: "#9DC88D", Moderate: "#F1B24A", High: "#ff8c42", Extreme: "#ff4d4d" };
const RISK_BG:    Record<string, string> = { Low: "rgba(157,200,141,0.15)", Moderate: "rgba(241,178,74,0.15)", High: "rgba(255,140,66,0.15)", Extreme: "rgba(255,77,77,0.15)" };
const RISK_ICON:  Record<string, string> = { Low: "🟢", Moderate: "🟡", High: "🟠", Extreme: "🔴" };

interface AlertLog { id: number; location_key: string; risk_label: string; alert_date: string; message: string; created_at: string; }
interface Prediction { date: string; risk_label: string; risk_probability: number; }

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

function createAudioCtx(): AudioContext | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  try { return new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
}
function playTone(ctx: AudioContext, freq: number, dur: number, type: OscillatorType, gain: number, start = 0) {
  const osc = ctx.createOscillator(); const g = ctx.createGain();
  osc.connect(g); g.connect(ctx.destination); osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
  osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur);
}
function playRiskSound(risk: string) {
  const ctx = createAudioCtx(); if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  if (risk === "Extreme") { [0, 0.22, 0.44, 0.66, 0.88, 1.1].forEach((t, i) => playTone(ctx, i % 2 === 0 ? 1400 : 900, 0.18, "square", 0.75, t)); }
  else if (risk === "High") { playTone(ctx, 520, 0.3, "sawtooth", 0.6, 0); playTone(ctx, 780, 0.4, "sawtooth", 0.7, 0.4); }
  else if (risk === "Moderate") { playTone(ctx, 440, 0.25, "sine", 0.45, 0); playTone(ctx, 550, 0.35, "sine", 0.45, 0.3); }
  else { playTone(ctx, 660, 0.4, "sine", 0.3, 0); }
}

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: { collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen?: boolean; setMobileOpen?: (v: boolean) => void }) {
  const loc = useLocation();
  const isMobile = useIsMobile();
  const links = [
    { to: "/home",     icon: <LayoutDashboard size={18} />, label: "Dashboard"   },
    { to: "/forecast", icon: <CalendarDays size={18} />,    label: "Forecast"    },
    { to: "/iot",      icon: <Wifi size={18} />,            label: "IoT Monitor" },
    { to: "/alerts",   icon: <Bell size={18} />,            label: "Alerts"      },
    { to: "/",         icon: <Activity size={18} />,        label: "Home"        },
  ];

  if (isMobile) return (
    <>
      {mobileOpen && <div onClick={() => setMobileOpen?.(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, backdropFilter: "blur(4px)" }} />}
      <aside style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 50, background: "rgba(8,22,18,0.98)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", transform: mobileOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.3s ease" }}>
        <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
            <div><div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff" }}>वन दृष्टि</div><div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div></div>
          </div>
          <button onClick={() => setMobileOpen?.(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {links.map(lk => {
            const active = loc.pathname === lk.to;
            return <Link key={lk.to} to={lk.to} onClick={() => setMobileOpen?.(false)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent", border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent", color: active ? "#F1B24A" : "rgba(255,255,255,0.7)", fontWeight: active ? 700 : 500, fontSize: 15, textDecoration: "none" }}>{lk.icon}<span>{lk.label}</span></Link>;
          })}
        </nav>
      </aside>
    </>
  );

  return (
    <aside style={{ width: collapsed ? 68 : 220, minHeight: "100vh", flexShrink: 0, background: "rgba(8,22,18,0.85)", backdropFilter: "blur(20px)", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", transition: "width 0.3s ease", overflow: "hidden", position: "sticky", top: 0, alignSelf: "flex-start" }}>
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <img src={logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        {!collapsed && <div><div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff" }}>वन दृष्टि</div><div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div></div>}
      </div>
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {links.map(lk => {
          const active = loc.pathname === lk.to;
          return <Link key={lk.to} to={lk.to} style={{ display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "12px 0" : "12px 14px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 14, background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent", border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent", color: active ? "#F1B24A" : "rgba(255,255,255,0.58)", fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: "none" }} onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>{lk.icon}{!collapsed && <span>{lk.label}</span>}</Link>;
        })}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} style={{ margin: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

interface Toast { id: number; msg: string; type: "success" | "error" | "info" }
function ToastList({ toasts, remove }: { toasts: Toast[]; remove: (id: number) => void }) {
  return (
    <div style={{ position: "fixed", top: 70, right: 16, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: "calc(100vw - 32px)" }}>
      {toasts.map(t => (
        <div key={t.id} style={{ padding: "12px 16px", borderRadius: 12, minWidth: 240, display: "flex", alignItems: "center", gap: 10, background: t.type === "success" ? "rgba(157,200,141,0.18)" : t.type === "error" ? "rgba(255,77,77,0.18)" : "rgba(241,178,74,0.18)", border: `1px solid ${t.type === "success" ? "rgba(157,200,141,0.4)" : t.type === "error" ? "rgba(255,77,77,0.4)" : "rgba(241,178,74,0.4)"}`, backdropFilter: "blur(14px)", color: "#fff", fontSize: 13 }}>
          {t.type === "success" ? <CheckCircle size={15} color="#9DC88D" /> : t.type === "error" ? <AlertTriangle size={15} color="#ff4d4d" /> : <Bell size={15} color="#F1B24A" />}
          <span style={{ flex: 1, fontSize: 12 }}>{t.msg}</span>
          <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      ))}
    </div>
  );
}

export default function Alerts() {
  const [history, setHistory]       = useState<AlertLog[]>([]);
  const [preds, setPreds]           = useState<Prediction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toasts, setToasts]         = useState<Toast[]>([]);
  const [sending, setSending]       = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const toastId = useRef(0);
  const isMobile = useIsMobile();

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
      if (data.sent) { addToast(`✅ ${label} alert sent — ${data.alerts} day(s)`, "success"); if (soundEnabled) playRiskSound(minRisk); await fetchData(); }
      else { addToast(`ℹ️ ${data.message}`, "info"); }
    } catch { addToast(`Failed to send ${label} alert`, "error"); }
    finally { setSending(null); }
  };

  const sendTestEmail   = async () => { setSending("test"); try { const res = await fetch(`${API}/api/alerts/test-email`, { method: "POST" }); const data = await res.json(); if (data.ok) { addToast("Test email sent!", "success"); if (soundEnabled) playRiskSound("Low"); } else throw new Error(data.error); } catch { addToast("Test email failed", "error"); } finally { setSending(null); } };
  const sendTestExtreme = async () => { setSending("test-extreme"); try { const res = await fetch(`${API}/api/alerts/test-extreme`, { method: "POST" }); const data = await res.json(); if (data.ok) { addToast("🔴 Test EXTREME alert sent!", "success"); if (soundEnabled) playRiskSound("Extreme"); } else throw new Error(data.error); } catch { addToast("Test extreme failed", "error"); } finally { setSending(null); } };
  const sendDailyReport = async () => { setSending("daily"); try { const res = await fetch(`${API}/api/alerts/daily-report`, { method: "POST" }); const data = await res.json(); if (data.ok && data.sent) { addToast(`Daily report sent — ${data.riskLevel}`, "success"); if (soundEnabled) playRiskSound(data.riskLevel ?? "Low"); } else { addToast(data.message ?? "No predictions", "info"); } } catch { addToast("Daily report failed", "error"); } finally { setSending(null); } };

  const worstPred   = preds.find(p => p.risk_label === "Extreme") ?? preds.find(p => p.risk_label === "High");
  const extremeDays = preds.filter(p => p.risk_label === "Extreme").length;
  const highDays    = preds.filter(p => p.risk_label === "High").length;
  const alertsToday = history.filter(h => h.alert_date === new Date().toISOString().slice(0, 10)).length;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px", ...extra });
  const btn = (color: string, disabled = false): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 999, background: disabled ? `${color}08` : `${color}18`, border: `1px solid ${color}35`, color: disabled ? `${color}60` : color, fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap" as const });

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading alerts…</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <ToastList toasts={toasts} remove={id => setToasts(prev => prev.filter(t => t.id !== id))} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><Menu size={22} /></button>}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>Alert Center</h1>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={10} /> Lumbini &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading…"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setSoundEnabled(s => !s)} style={{ ...btn(soundEnabled ? "#9DC88D" : "#888"), padding: "8px 12px" }}>
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {!isMobile && (soundEnabled ? "Sound On" : "Sound Off")}
            </button>
            <button onClick={fetchData} style={{ ...btn("#9DC88D"), padding: "8px 12px" }}>
              <RefreshCw size={13} />{!isMobile && " Refresh"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: isMobile ? "16px" : "24px", display: "flex", flexDirection: "column", gap: isMobile ? 14 : 22, overflowY: "auto" }}>

          {/* Worst pred banner */}
          {worstPred && (
            <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderRadius: 18, background: RISK_BG[worstPred.risk_label], border: `2px solid ${RISK_COLOR[worstPred.risk_label]}50`, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: 16, background: `${RISK_COLOR[worstPred.risk_label]}20`, border: `1px solid ${RISK_COLOR[worstPred.risk_label]}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Flame size={isMobile ? 20 : 26} color={RISK_COLOR[worstPred.risk_label]} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: RISK_COLOR[worstPred.risk_label] }}>{RISK_ICON[worstPred.risk_label]} {worstPred.risk_label} Risk Detected</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{worstPred.date} · {Math.round(worstPred.risk_probability * 100)}% confidence</div>
                </div>
              </div>
              <button onClick={() => sendAlert(worstPred.risk_label === "Extreme" ? "Extreme" : "High", worstPred.risk_label)} disabled={!!sending} style={{ ...btn(RISK_COLOR[worstPred.risk_label], !!sending), padding: "10px 18px", fontSize: 13 }}>
                <BellRing size={14} />{sending ? "Sending…" : `Send ${worstPred.risk_label} Alert`}
              </button>
            </div>
          )}

          {/* Stats — 2 col mobile, 4 desktop */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 14 }}>
            {[
              { label: "Total Alerts",  val: history.length,  color: "#60a5fa", icon: <Bell size={18} /> },
              { label: "Today",         val: alertsToday,     color: "#F1B24A", icon: <Clock size={18} /> },
              { label: "Extreme Days",  val: extremeDays,     color: "#ff4d4d", icon: <Flame size={18} /> },
              { label: "High Days",     val: highDays,        color: "#ff8c42", icon: <AlertTriangle size={18} /> },
            ].map(s => (
              <div key={s.label} style={{ ...card(), padding: "16px 14px" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions — stacked on mobile */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 14 : 18 }}>
            <div style={card()}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 }}>Send Alert Notifications</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { color: "#ff8c42", title: "🔶 High Risk Alert",    desc: "Emails when High or Extreme detected",       key: "High",    action: () => sendAlert("High", "High") },
                  { color: "#ff4d4d", title: "🔴 Extreme Risk Only",  desc: "Emails only when Extreme days exist",         key: "Extreme", action: () => sendAlert("Extreme", "Extreme") },
                  { color: "#60a5fa", title: "📋 Daily Report",       desc: "Full 7-day report for all risk levels",       key: "daily",   action: sendDailyReport },
                ].map(item => (
                  <div key={item.key} style={{ padding: "14px 16px", borderRadius: 14, background: `${item.color}08`, border: `1px solid ${item.color}22`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{item.desc}</div>
                    </div>
                    <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                      <Send size={12} />{sending === item.key ? "Sending…" : "Send"}
                    </button>
                  </div>
                ))}

                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Testing & Diagnostics</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { color: "#9DC88D", title: "✅ SMTP Smoke Test",    key: "test",         action: sendTestEmail,   icon: <Mail size={12} /> },
                      { color: "#ff4d4d", title: "🔴 Fake Extreme Alert", key: "test-extreme", action: sendTestExtreme, icon: <Zap size={12} /> },
                    ].map(item => (
                      <div key={item.key} style={{ padding: "12px 14px", borderRadius: 12, background: `${item.color}07`, border: `1px solid ${item.color}20`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.title}</div>
                        <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                          {item.icon}{sending === item.key ? "Running…" : "Run"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 18 }}>
              {/* Sound tester */}
              <div style={card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Sound Preview</div>
                  <button onClick={() => setSoundEnabled(s => !s)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: soundEnabled ? "rgba(157,200,141,0.12)" : "rgba(100,100,100,0.12)", border: `1px solid ${soundEnabled ? "rgba(157,200,141,0.3)" : "rgba(100,100,100,0.3)"}`, color: soundEnabled ? "#9DC88D" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />} {soundEnabled ? "On" : "Off"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 8 }}>
                  {["Extreme", "High", "Moderate", "Low"].map(risk => (
                    <button key={risk} onClick={() => { if (soundEnabled) playRiskSound(risk); }} disabled={!soundEnabled}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, width: "100%", background: `${RISK_COLOR[risk]}10`, border: `1px solid ${RISK_COLOR[risk]}28`, cursor: soundEnabled ? "pointer" : "not-allowed", opacity: soundEnabled ? 1 : 0.5 }}>
                      <span style={{ fontSize: 14 }}>{RISK_ICON[risk]}</span>
                      <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: RISK_COLOR[risk] }}>{risk}</div>
                      </div>
                      <Volume2 size={12} color={RISK_COLOR[risk]} style={{ opacity: 0.6 }} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Config */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Email Config</div>
                {[
                  { label: "SMTP",       val: "smtp.gmail.com",      color: "#9DC88D", icon: <Shield size={12} /> },
                  { label: "Auto Alert", val: "High & Extreme",       color: "#ff8c42", icon: <BellRing size={12} /> },
                  { label: "Report",     val: "Daily at 10:35 AM",   color: "#60a5fa", icon: <Clock size={12} /> },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: item.color }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.val}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(157,200,141,0.07)", border: "1px solid rgba(157,200,141,0.2)", fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 7 }}>
                  <CheckCircle size={12} color="#9DC88D" /> Run SMTP Test to verify delivery.
                </div>
              </div>

              {/* 7-day mini */}
              {preds.length > 0 && (
                <div style={card()}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>7-Day Risk</div>
                  {preds.slice(0, 7).map((p, i) => {
                    const col = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                    const pct = Math.round(p.risk_probability * 100);
                    const day = new Date(p.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", width: 70, flexShrink: 0 }}>{day}</div>
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: col, width: 60, textAlign: "right", flexShrink: 0 }}>{RISK_ICON[p.risk_label]} {p.risk_label}</span>
                      </div>
                    );
                  })}
                  <Link to="/forecast" style={{ display: "block", marginTop: 10, textAlign: "center", fontSize: 12, color: "#F1B24A", fontWeight: 700, textDecoration: "none", padding: "7px", borderRadius: 10, background: "rgba(241,178,74,0.08)", border: "1px solid rgba(241,178,74,0.2)" }}>Full Forecast →</Link>
                </div>
              )}
            </div>
          </div>

          {/* Alert history */}
          <div style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Alert History</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>{history.length} record{history.length !== 1 ? "s" : ""}</span>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(157,200,141,0.1)", border: "1px solid rgba(157,200,141,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BellOff size={22} color="#9DC88D" />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#9DC88D" }}>No alerts sent yet</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Alerts appear here when High or Extreme risk is detected</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {history.map((row, i) => {
                  const col      = RISK_COLOR[row.risk_label] ?? "#9DC88D";
                  const expanded = expandedLog === i;
                  return (
                    <div key={i} style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${expanded ? col + "35" : "rgba(255,255,255,0.07)"}`, overflow: "hidden" }}>
                      <div style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpandedLog(expanded ? null : i)}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30`, flexShrink: 0 }}>{RISK_ICON[row.risk_label]} {isMobile ? "" : row.risk_label}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.message}</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{isMobile ? row.alert_date : row.location_key}</div>
                        </div>
                        {!isMobile && (
                          <div style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{row.alert_date}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{new Date(row.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}</div>
                          </div>
                        )}
                        <div style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</div>
                      </div>
                      {expanded && (
                        <div style={{ padding: isMobile ? "0 14px 14px" : "0 18px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 8 }}>
                            {[
                              { label: "Alert ID",   val: `#${row.id}` },
                              { label: "Location",   val: row.location_key },
                              { label: "Alert Date", val: row.alert_date },
                              { label: "Risk Level", val: row.risk_label },
                              { label: "Sent At",    val: new Date(row.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
                            ].map(f => (
                              <div key={f.label} style={{ padding: "9px 10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{f.label}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{f.val}</div>
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
        @keyframes slideIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
      `}</style>
    </div>
  );
}