import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CalendarDays, AlertTriangle, CheckCircle, RefreshCw,
  MapPin, Clock, Bell, TrendingUp, ChevronDown, ChevronUp,
  Activity, LayoutDashboard, Menu, X, Wifi, Flame,
  Thermometer, Droplets, Wind,
} from "lucide-react";
import logo from "../assets/logo.png";

const API = "http://localhost:3000";

const RISK_COLOR: Record<string, string> = { Low: "#9DC88D", Moderate: "#F1B24A", High: "#ff8c42", Extreme: "#ff4d4d" };
const RISK_BG:    Record<string, string> = { Low: "rgba(157,200,141,0.15)", Moderate: "rgba(241,178,74,0.15)", High: "rgba(255,140,66,0.15)", Extreme: "rgba(255,77,77,0.15)" };
const RISK_ICON:  Record<string, string> = { Low: "🟢", Moderate: "🟡", High: "🟠", Extreme: "🔴" };

interface Prediction {
  date: string; risk_code: number; risk_label: string;
  risk_probability: number; model_name: string;
}
interface AlertLog {
  id: number; location_key: string; risk_label: string;
  alert_date: string; message: string; created_at: string;
}

function RiskBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.round(pct * 100))}%`, background: color, borderRadius: 999, transition: "width 1s ease" }} />
    </div>
  );
}

// Sidebar (same structure as Home)
function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const loc = useLocation();
  const links = [
    { to: "/home",     icon: <LayoutDashboard size={18} />, label: "Dashboard" },
    { to: "/forecast", icon: <CalendarDays size={18} />,    label: "Forecast" },
    { to: "/iot",      icon: <Wifi size={18} />,            label: "IoT Monitor" },
    { to: "/",         icon: <Activity size={18} />,        label: "Home" },
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
      <button onClick={() => setCollapsed(!collapsed)} style={{ margin: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

export default function Forecast() {
  const [preds, setPreds]           = useState<Prediction[]>([]);
  const [history, setHistory]       = useState<AlertLog[]>([]);
  const [loading, setLoading]       = useState(true);
  const [runningAlert, setRunningAlert] = useState(false);
  const [alertMsg, setAlertMsg]     = useState("");
  const [collapsed, setCollapsed]   = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);
  const [lastRefresh, setLastRefresh] = useState("");

  const fetchData = async () => {
    try {
      const [predRes, histRes] = await Promise.all([
        fetch(`${API}/api/ml/predictions?limit=7`),
        fetch(`${API}/api/alerts/history?limit=20`),
      ]);
      if (predRes.ok) { const p = await predRes.json(); setPreds(p.data || []); }
      if (histRes.ok) { const h = await histRes.json(); setHistory(h.data || []); }
      setLastRefresh(new Date().toLocaleTimeString());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const triggerAlert = async () => {
    setRunningAlert(true); setAlertMsg("");
    try {
      const res  = await fetch(`${API}/api/alerts/run-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minRisk: "High" }) });
      const data = await res.json();
      setAlertMsg(data.sent ? `✅ Alert sent to ${data.recipients?.join(", ")} — ${data.alerts} high-risk day(s)` : `ℹ️ ${data.message}`);
      await fetchData();
    } catch { setAlertMsg("❌ Failed to send alert."); }
    finally { setRunningAlert(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const worstLabel = preds.find(p => p.risk_label === "Extreme")?.risk_label ?? preds.find(p => p.risk_label === "High")?.risk_label ?? null;
  const highRiskCount = preds.filter(p => ["High", "Extreme"].includes(p.risk_label)).length;

  const card = (style?: React.CSSProperties) => ({
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 20, padding: "22px", ...style,
  });

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading forecast…</div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>7-Day Forecast</h1>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={11} /> Lumbini Forest Zone &nbsp;·&nbsp; <Clock size={11} /> {lastRefresh || "Loading…"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={fetchData} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", color: "#9DC88D", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button onClick={triggerAlert} disabled={runningAlert} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 999, background: runningAlert ? "rgba(255,140,66,0.08)" : "rgba(255,140,66,0.15)", border: "1px solid rgba(255,140,66,0.3)", color: "#ff8c42", fontWeight: 700, fontSize: 13, cursor: runningAlert ? "not-allowed" : "pointer" }}>
              <Bell size={13} style={{ animation: runningAlert ? "spin 1s linear infinite" : "none" }} />
              {runningAlert ? "Sending…" : "Send Alert Email"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: 22, overflowY: "auto" }}>

          {/* Alert message */}
          {alertMsg && (
            <div style={{ padding: "14px 20px", borderRadius: 14, background: alertMsg.startsWith("✅") ? "rgba(157,200,141,0.12)" : alertMsg.startsWith("ℹ") ? "rgba(241,178,74,0.12)" : "rgba(255,77,77,0.12)", border: `1px solid ${alertMsg.startsWith("✅") ? "rgba(157,200,141,0.3)" : alertMsg.startsWith("ℹ") ? "rgba(241,178,74,0.3)" : "rgba(255,77,77,0.3)"}`, color: "#fff", fontSize: 14 }}>
              {alertMsg}
            </div>
          )}

          {/* Summary banner */}
          {worstLabel && (
            <div style={{ padding: "18px 24px", borderRadius: 18, background: RISK_BG[worstLabel], border: `1px solid ${RISK_COLOR[worstLabel]}40`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${RISK_COLOR[worstLabel]}20`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Flame size={24} color={RISK_COLOR[worstLabel]} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: RISK_COLOR[worstLabel] }}>{RISK_ICON[worstLabel]} {worstLabel} Risk Detected</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{highRiskCount} high-risk day{highRiskCount !== 1 ? "s" : ""} in the next 7-day forecast — email alert recommended</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => {
                  const cnt = preds.filter(p => p.risk_label === lbl).length;
                  return (
                    <div key={lbl} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: RISK_COLOR[lbl] }}>{cnt}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{lbl}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No predictions */}
          {preds.length === 0 && (
            <div style={{ ...card(), textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>No forecast data yet</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Run POST /api/ml/predict-forecast to generate predictions</div>
            </div>
          )}

          {/* Day cards */}
          {preds.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Daily Breakdown</div>
              {preds.slice(0, 7).map((p, i) => {
                const col   = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                const pct   = Math.round(p.risk_probability * 100);
                const dayFull  = new Date(p.date).toLocaleDateString("en", { weekday: "long" });
                const dateStr  = new Date(p.date).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" });
                const isToday  = i === 0;
                const expanded = expandedDay === i;

                return (
                  <div key={i} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${expanded ? col + "40" : "rgba(255,255,255,0.09)"}`, borderRadius: 18, overflow: "hidden", transition: "border-color 0.3s" }}>
                    {/* Header row */}
                    <div style={{ padding: "18px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer" }}
                      onClick={() => setExpandedDay(expanded ? null : i)}>
                      <div style={{ width: 46, height: 46, borderRadius: 14, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>
                        {RISK_ICON[p.risk_label]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{dayFull}</div>
                          {isToday && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "rgba(157,200,141,0.2)", color: "#9DC88D", border: "1px solid rgba(157,200,141,0.35)" }}>TODAY</span>}
                          {["High", "Extreme"].includes(p.risk_label) && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: `${col}20`, color: col, border: `1px solid ${col}40` }}>⚠ ALERT</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>{dateStr}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: col }}>{p.risk_label}</div>
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>Confidence: {pct}%</div>
                        </div>
                        <div style={{ width: 80 }}>
                          <RiskBar pct={p.risk_probability} color={col} />
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.4)" }}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</div>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {expanded && (
                      <div style={{ padding: "0 22px 20px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                        <div style={{ paddingTop: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                          <div style={{ padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Risk Score</div>
                            <div style={{ fontSize: 32, fontWeight: 900, color: col }}>{pct}<span style={{ fontSize: 16 }}>%</span></div>
                            <div style={{ marginTop: 10 }}><RiskBar pct={p.risk_probability} color={col} /></div>
                          </div>
                          <div style={{ padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>Risk Category</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: col }}>{RISK_ICON[p.risk_label]} {p.risk_label}</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Code: {p.risk_code}</div>
                          </div>
                          <div style={{ padding: "16px", borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>ML Model</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{p.model_name || "XGBoost"}</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Multi-class · 6 features</div>
                          </div>
                        </div>
                        {["High", "Extreme"].includes(p.risk_label) && (
                          <div style={{ marginTop: 14, padding: "14px 18px", borderRadius: 14, background: `${col}10`, border: `1px solid ${col}25`, display: "flex", alignItems: "center", gap: 12 }}>
                            <AlertTriangle size={16} color={col} />
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                              <strong style={{ color: col }}>Action Required:</strong> {p.risk_label === "Extreme" ? "Extreme fire danger — avoid all open burning, deploy fire watch teams, notify local authorities immediately." : "High fire danger — restrict burning activities, increase patrol frequency, ensure emergency contacts are notified."}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Risk distribution bar */}
          {preds.length > 0 && (
            <div style={card()}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 18 }}>7-Day Risk Distribution</div>
              <div style={{ display: "flex", height: 32, borderRadius: 10, overflow: "hidden", gap: 2 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => {
                  const cnt = preds.filter(p => p.risk_label === lbl).length;
                  if (!cnt) return null;
                  const pct = (cnt / preds.length) * 100;
                  return (
                    <div key={lbl} style={{ flex: pct, background: RISK_COLOR[lbl], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#1d241e", minWidth: pct > 10 ? "auto" : 0, transition: "flex 0.5s ease" }}>
                      {pct > 12 ? `${cnt}d` : ""}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: RISK_COLOR[lbl] }} />
                    {lbl}: {preds.filter(p => p.risk_label === lbl).length} days
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alert history */}
          <div style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Alert History</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>{history.length} records</span>
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <CheckCircle size={28} color="#9DC88D" />
                <div style={{ fontSize: 14, fontWeight: 600, color: "#9DC88D" }}>No alert history</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>Alerts will appear here once sent</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>{["Alert Date", "Location", "Risk Level", "Message", "Sent At"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 600, letterSpacing: 0.5, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {history.map((row, i) => {
                      const col = RISK_COLOR[row.risk_label] ?? "#9DC88D";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <td style={{ padding: "11px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{row.alert_date}</td>
                          <td style={{ padding: "11px 12px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{row.location_key}</td>
                          <td style={{ padding: "11px 12px" }}><span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30` }}>{row.risk_label}</span></td>
                          <td style={{ padding: "11px 12px", fontSize: 12, color: "rgba(255,255,255,0.5)", maxWidth: 300 }}>{row.message}</td>
                          <td style={{ padding: "11px 12px", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{new Date(row.created_at).toLocaleDateString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
      `}</style>
    </div>
  );
}