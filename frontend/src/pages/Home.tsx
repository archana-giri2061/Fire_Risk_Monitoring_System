import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Thermometer, Droplets, Wind, CloudRain,
  Bell, Activity, TrendingUp, TrendingDown,
  RefreshCw, AlertTriangle, CheckCircle, Database,
  MapPin, Clock, Cpu, TreePine, LayoutDashboard, BarChart2,
  Menu, X, Wifi, CalendarDays,
} from "lucide-react";
import logo from "../assets/logo.png";
// ── Import API URL from central config ────────────────────────────────────
import { API } from "../api";

interface Overview {
  monitoringStatus: string; lastUpdated: string; dataSource: string;
  temperature: number; humidity: number; windSpeed: number;
  rainfall: number; pressure: number; activeAlerts: number;
}
interface Trend  { time: string; temperature: number; humidity: number; windSpeed: number; }
interface Reading { time: string; location: string; temperature: number; humidity: number; windSpeed: number; rainfall: number; pressure: number; status: string; }
interface Alert  { time: string; type: string; location: string; severity: string; message: string; }
interface Area   { area: string; avgTemperature: number; avgHumidity: number; avgWindSpeed: number; condition: string; action: string; lat: number; lng: number; }
interface DashboardData { overview: Overview; trends: Trend[]; readings: Reading[]; alerts: Alert[]; areas: Area[]; }
interface Prediction { date: string; risk_code: number; risk_label: string; risk_probability: number; model_name: string; }

const RISK_COLOR: Record<string, string> = { Low: "#9DC88D", Moderate: "#F1B24A", High: "#ff8c42", Extreme: "#ff4d4d" };
const RISK_BG:    Record<string, string> = { Low: "rgba(157,200,141,0.18)", Moderate: "rgba(241,178,74,0.18)", High: "rgba(255,140,66,0.18)", Extreme: "rgba(255,77,77,0.18)" };
const RISK_ICON:  Record<string, string> = { Low: "🟢", Moderate: "🟡", High: "🟠", Extreme: "🔴" };


function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => { const fn = () => setMobile(window.innerWidth < 768); window.addEventListener("resize", fn); return () => window.removeEventListener("resize", fn); }, []);
  return mobile;
}

function RiskBar({ pct, color }: { pct: number; color: string }) {
  return <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}><div style={{ height: "100%", width: `${Math.min(100, Math.round(pct * 100))}%`, background: color, borderRadius: 999, transition: "width 0.8s ease" }} /></div>;
}

function SparkBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
      {values.slice(-12).map((v, i) => (
        <div key={i} style={{ flex: 1, borderRadius: 3, background: color, height: `${Math.max(4, (v / max) * 100)}%`, opacity: i === values.slice(-12).length - 1 ? 1 : 0.45 + i * 0.045 }} />
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen }: { collapsed: boolean; setCollapsed: (v: boolean) => void; mobileOpen?: boolean; setMobileOpen?: (v: boolean) => void }) {
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
          {links.map(lk => { const active = loc.pathname === lk.to; return <Link key={lk.to} to={lk.to} onClick={() => setMobileOpen?.(false)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent", border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent", color: active ? "#F1B24A" : "rgba(255,255,255,0.7)", fontWeight: active ? 700 : 500, fontSize: 15, textDecoration: "none" }}>{lk.icon}<span>{lk.label}</span></Link>; })}
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
        {links.map(lk => { const active = loc.pathname === lk.to; return <Link key={lk.to} to={lk.to} style={{ display: "flex", alignItems: "center", gap: 12, padding: collapsed ? "12px 0" : "12px 14px", justifyContent: collapsed ? "center" : "flex-start", borderRadius: 14, background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent", border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent", color: active ? "#F1B24A" : "rgba(255,255,255,0.58)", fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: "none" }} onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }} onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>{lk.icon}{!collapsed && <span>{lk.label}</span>}</Link>; })}
      </nav>
      <button onClick={() => setCollapsed(!collapsed)} style={{ margin: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

function StatCard({ icon, label, value, unit, color, sub, trend }: { icon: React.ReactNode; label: string; value: string | number; unit?: string; color: string; sub?: string; trend?: "up" | "down" }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 13, background: `${color}18`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
        {trend && <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: trend === "up" ? "#9DC88D" : "#ff8c42" }}>{trend === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}</div>}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}<span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3, color: "rgba(255,255,255,0.5)" }}>{unit}</span></div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData]             = useState<DashboardData | null>(null);
  const [preds, setPreds]           = useState<Prediction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [error, setError]           = useState("");
  const [lastSync, setLastSync]     = useState("");
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();

  const fetchAll = async () => {
    try {
      setError("");
      const [dashRes, predRes] = await Promise.all([
        fetch(`${API}/api/dashboard/home`),
        fetch(`${API}/api/ml/predictions?limit=7`),
      ]);
      if (dashRes.ok) {
        const d = await dashRes.json();
        setData(d);
        setLastSync(d.overview?.lastUpdated || new Date().toLocaleString());
      } else {
        setError(`Dashboard error: ${dashRes.status} ${dashRes.statusText}`);
      }
      if (predRes.ok) { const p = await predRes.json(); setPreds(p.data || []); }
    } catch {
      setError(`Cannot reach backend at ${API}. Check your VITE_API_URL env variable.`);
    } finally { setLoading(false); }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${API}/api/weather/sync-all`, { method: "POST" });
      await fetchAll();
    } catch { /**/ }
    finally { setSyncing(false); }
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading dashboard…</div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Connecting to {API}</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const ov = data?.overview;
  const worstPred = preds.find(p => p.risk_label === "Extreme") || preds.find(p => p.risk_label === "High");

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><Menu size={22} /></button>}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>Dashboard</h1>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={10} /> Lumbini &nbsp;·&nbsp; <Clock size={10} /> {lastSync || "Syncing…"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isMobile && <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", color: "#9DC88D", fontSize: 12, fontWeight: 600 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9DC88D", animation: "pulse 2s infinite" }} /> Live
            </div>}
            <button onClick={handleSync} disabled={syncing} style={{ display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "8px 12px" : "8px 16px", borderRadius: 999, background: "rgba(241,178,74,0.15)", border: "1px solid rgba(241,178,74,0.3)", color: "#F1B24A", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <RefreshCw size={13} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
              {!isMobile && (syncing ? "Syncing…" : "Sync Now")}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: isMobile ? "16px" : "24px", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22, overflowY: "auto" }}>

          {error && (
            <div style={{ padding: "14px 18px", borderRadius: 14, display: "flex", alignItems: "flex-start", gap: 12, background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.3)", color: "#ff9999", fontSize: 13 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Backend Connection Error</div>
                <div style={{ opacity: 0.8 }}>{error}</div>
                <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>API URL: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 6px", borderRadius: 4 }}>{API}</code></div>
              </div>
            </div>
          )}

          {worstPred && (
            <div style={{ padding: isMobile ? "14px 16px" : "14px 20px", borderRadius: 16, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", background: `${RISK_BG[worstPred.risk_label]}`, border: `1px solid ${RISK_COLOR[worstPred.risk_label]}40`, gap: 12, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={16} color={RISK_COLOR[worstPred.risk_label]} />
                <div>
                  <span style={{ fontWeight: 700, color: RISK_COLOR[worstPred.risk_label] }}>{RISK_ICON[worstPred.risk_label]} {worstPred.risk_label} Risk</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginLeft: 8 }}>{worstPred.date} · {Math.round(worstPred.risk_probability * 100)}%</span>
                </div>
              </div>
              <Link to="/forecast" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: "none", background: RISK_COLOR[worstPred.risk_label], color: "#1d241e", whiteSpace: "nowrap" }}>View Forecast</Link>
            </div>
          )}

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 16 }}>
            <StatCard icon={<Thermometer size={18} />} label="Temperature" value={ov?.temperature != null ? ov.temperature.toFixed(1) : "--"} unit="°C"   color="#ff8c42" sub="Current" trend="up" />
            <StatCard icon={<Droplets size={18} />}    label="Humidity"    value={ov?.humidity    != null ? ov.humidity.toFixed(0)    : "--"} unit="%"    color="#60a5fa" sub="Relative" />
            <StatCard icon={<Wind size={18} />}        label="Wind"        value={ov?.windSpeed   != null ? ov.windSpeed.toFixed(1)   : "--"} unit="km/h" color="#9DC88D" sub="Max speed" trend="up" />
            <StatCard icon={<CloudRain size={18} />}   label="Rainfall"    value={ov?.rainfall    != null ? ov.rainfall.toFixed(1)    : "--"} unit="mm"   color="#a78bfa" sub="Sum" />
          </div>

          {/* Status + Forecast */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: isMobile ? 14 : 16 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Current Status</div>
              {(() => {
                const todayPred = preds[0];
                const rLabel = todayPred?.risk_label ?? "Unknown";
                const rColor = RISK_COLOR[rLabel] ?? "#888";
                const rProb  = todayPred ? Math.round(todayPred.risk_probability * 100) : 0;
                return (
                  <>
                    <div style={{ textAlign: "center", padding: "16px 0" }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Fire Risk Level</div>
                      <div style={{ fontSize: isMobile ? 34 : 44, fontWeight: 900, color: rColor, lineHeight: 1 }}>{rLabel}</div>
                      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>Confidence: {rProb}%</div>
                      <RiskBar pct={rProb / 100} color={rColor} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "Status",      val: ov?.monitoringStatus ?? "--",     icon: <CheckCircle size={12} />, color: "#9DC88D" },
                        { label: "Data Source", val: ov?.dataSource       ?? "--",     icon: <Database size={12} />,    color: "#60a5fa" },
                        { label: "Alerts",      val: `${ov?.activeAlerts ?? 0} active`, icon: <Bell size={12} />,       color: "#F1B24A" },
                      ].map(item => (
                        <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,0.45)", fontSize: 12 }}><span style={{ color: item.color }}>{item.icon}</span>{item.label}</div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.val}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>7-Day Risk Forecast</div>
                <Link to="/forecast" style={{ fontSize: 12, color: "#F1B24A", fontWeight: 600, textDecoration: "none", padding: "4px 10px", borderRadius: 999, background: "rgba(241,178,74,0.12)", border: "1px solid rgba(241,178,74,0.25)" }}>Full →</Link>
              </div>
              {preds.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No predictions yet.<br/>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Run POST /api/ml/predict-forecast to generate</span>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(preds.length, 7)},1fr)`, gap: isMobile ? 5 : 8 }}>
                  {preds.slice(0, 7).map((p, i) => {
                    const col = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                    const day = new Date(p.date).toLocaleDateString("en", { weekday: "short" });
                    const dt  = new Date(p.date).toLocaleDateString("en", { month: "short", day: "numeric" });
                    return (
                      <div key={i} style={{ textAlign: "center", padding: isMobile ? "8px 4px" : "12px 6px", borderRadius: 14, background: `${col}14`, border: `1px solid ${col}30` }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 600 }}>{day}</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>{dt}</div>
                        <div style={{ fontSize: isMobile ? 14 : 18, marginBottom: 6 }}>{RISK_ICON[p.risk_label]}</div>
                        <div style={{ fontSize: 9, color: col, fontWeight: 800, marginBottom: 4 }}>{p.risk_label}</div>
                        <RiskBar pct={p.risk_probability} color={col} />
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>{Math.round(p.risk_probability * 100)}%</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Trends + Areas */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: isMobile ? 14 : 16 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 }}>Weather Trends</div>
              {data?.trends && data.trends.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { label: "Temperature (°C)", key: "temperature" as const, color: "#ff8c42" },
                    { label: "Humidity (%)",      key: "humidity" as const,    color: "#60a5fa" },
                    { label: "Wind Speed (km/h)", key: "windSpeed" as const,   color: "#9DC88D" },
                  ].map(series => (
                    <div key={series.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{series.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: series.color }}>{data.trends[data.trends.length - 1]?.[series.key]?.toFixed(1) ?? "--"}</span>
                      </div>
                      <SparkBar values={data.trends.map(t => t[series.key])} color={series.color} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No weather data.<br/>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Run POST /api/weather/sync-all to fetch data</span>
                </div>
              )}
            </div>

            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Monitored Areas</div>
              {data?.areas && data.areas.length > 0 ? data.areas.map((area, i) => {
                const col = area.condition === "Critical Watch" ? "#ff4d4d" : area.condition === "Dry Conditions" ? "#F1B24A" : area.condition === "Wind Alert" ? "#ff8c42" : "#9DC88D";
                return (
                  <div key={i} style={{ padding: "14px", borderRadius: 16, marginBottom: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${col}25` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TreePine size={14} color="#9DC88D" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{area.area}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>{area.lat?.toFixed(3)}, {area.lng?.toFixed(3)}</div>
                        </div>
                      </div>
                      <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${col}20`, color: col, border: `1px solid ${col}35` }}>{area.condition}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Temp", val: `${area.avgTemperature?.toFixed(1)}°C`, color: "#ff8c42" },
                        { label: "Hum",  val: `${area.avgHumidity?.toFixed(0)}%`,     color: "#60a5fa" },
                        { label: "Wind", val: `${area.avgWindSpeed?.toFixed(1)}km/h`,  color: "#9DC88D" },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign: "center", padding: "7px 4px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.val}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8, background: `${col}10`, border: `1px solid ${col}20`, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>⚡ {area.action}</div>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No area data yet</div>}
            </div>
          </div>

          {/* Readings table */}
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px", overflowX: "auto" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Recent Weather Readings</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 480 : "auto" }}>
              <thead>
                <tr>{["Date", "Temp", "Humidity", "Wind", "Rainfall", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 600, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {data?.readings?.slice(0, 8).map((r, i) => {
                  const col = r.status === "Critical Watch" ? "#ff4d4d" : r.status === "Dry Conditions" ? "#F1B24A" : r.status === "Wind Alert" ? "#ff8c42" : "#9DC88D";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{new Date(r.time).toLocaleDateString("en", { month: "short", day: "numeric" })}</td>
                      <td style={{ padding: "10px", fontSize: 13, fontWeight: 700, color: "#ff8c42" }}>{r.temperature?.toFixed(1)}°</td>
                      <td style={{ padding: "10px", fontSize: 13, color: "#60a5fa" }}>{r.humidity?.toFixed(0)}%</td>
                      <td style={{ padding: "10px", fontSize: 13, color: "#9DC88D" }}>{r.windSpeed?.toFixed(1)}</td>
                      <td style={{ padding: "10px", fontSize: 13, color: "#a78bfa" }}>{r.rainfall?.toFixed(1)}</td>
                      <td style={{ padding: "10px" }}><span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30` }}>{r.status}</span></td>
                    </tr>
                  );
                }) ?? <tr><td colSpan={6} style={{ textAlign: "center", padding: "28px", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No readings yet — sync weather data first</td></tr>}
              </tbody>
            </table>
          </div>

          {/* Quick Actions */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 14 : 16 }}>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Quick Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Sync Weather Data", color: "#9DC88D", icon: <RefreshCw size={14} />, endpoint: "/api/weather/sync-all",    method: "POST" },
                  { label: "Run ML Prediction", color: "#F1B24A", icon: <Cpu size={14} />,        endpoint: "/api/ml/predict-forecast", method: "POST" },
                  { label: "Send Risk Alert",   color: "#ff8c42", icon: <Bell size={14} />,       endpoint: "/api/alerts/run-email",    method: "POST" },
                  { label: "Retrain Model",     color: "#c084fc", icon: <BarChart2 size={14} />,  endpoint: "/api/ml/train",            method: "POST" },
                ].map(action => (
                  <button key={action.label} onClick={async () => {
                    try { await fetch(`${API}${action.endpoint}`, { method: action.method }); if (action.endpoint.includes("sync") || action.endpoint.includes("predict")) fetchAll(); } catch { /**/ }
                  }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, cursor: "pointer", background: `${action.color}12`, border: `1px solid ${action.color}28`, color: action.color, fontWeight: 600, fontSize: 13, textAlign: "left" }}>
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>ML Model</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(241,178,74,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}><Cpu size={20} color="#F1B24A" /></div>
                <div><div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>XGBoost</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>Multi-class classifier</div></div>
              </div>
              {[{ label: "Features", val: "6 weather vars" }, { label: "Classes", val: "4 risk levels" }, { label: "Data", val: "60 days" }, { label: "Retrain", val: "Every 30 min" }].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.42)" }}>{item.label}</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{item.val}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Monitoring Zone</div>
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}><MapPin size={24} color="#9DC88D" /></div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Lumbini</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Nepal Forest Zone</div>
              </div>
              {[{ label: "Latitude", val: "28.002°N" }, { label: "Longitude", val: "83.036°E" }, { label: "Archive", val: "60 days" }, { label: "Forecast", val: "7 days" }].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.42)" }}>{item.label}</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.45;transform:scale(1.35)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
      `}</style>
    </div>
  );
}