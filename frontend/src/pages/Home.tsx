/**
 * Home.tsx — Main Dashboard
 * --------------------------
 * Displays live weather stats, 7-day risk forecast, weather trends,
 * monitored areas, historical readings, and quick admin actions.
 */
import AdminLogin from "./AdminLogin";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Thermometer, Droplets, Wind, CloudRain, Bell,
  TrendingUp, TrendingDown, RefreshCw, AlertTriangle, CheckCircle,
  Database, MapPin, Clock, Cpu, TreePine, BarChart2, Menu,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { useIsMobile } from "../hooks/useIsMobile";
import { RISK_COLOR, RISK_BG, RISK_ICON } from "../utils/risk";
import { API, api, isAdmin, setAdminKey, clearAdminKey, getAdminKey } from "../api";
import type { DashboardData, Prediction } from "../api";

/* ── Micro components ──────────────────────────────────────── */
function RiskBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden", marginTop: 10 }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.round(pct * 100))}%`,
        background: color, borderRadius: 999,
        transition: "width 0.8s ease",
      }} />
    </div>
  );
}

function SparkBar({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }}>
      {values.slice(-12).map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1, borderRadius: 3, background: color,
            height: `${Math.max(4, (v / max) * 100)}%`,
            opacity: i === values.slice(-12).length - 1 ? 1 : 0.45 + i * 0.045,
          }}
        />
      ))}
    </div>
  );
}

function StatCard({
  icon, label, value, unit, color, sub, trend,
}: {
  icon: React.ReactNode; label: string; value: string | number;
  unit?: string; color: string; sub?: string; trend?: "up" | "down";
}) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.05)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 20, padding: "16px 18px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 13,
          background: `${color}18`, border: `1px solid ${color}28`,
          display: "flex", alignItems: "center", justifyContent: "center", color,
        }}>{icon}</div>
        {trend && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: trend === "up" ? "#9DC88D" : "#ff8c42" }}>
            {trend === "up" ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color, lineHeight: 1 }}>
        {value}
        <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 3, color: "rgba(255,255,255,0.5)" }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData]             = useState<DashboardData | null>(null);
  const [preds, setPreds]           = useState<Prediction[]>([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [error, setError]           = useState("");
  const [lastSync, setLastSync]     = useState("");
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [adminKey, setAdminKeyState]  = useState(getAdminKey());
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const isMobile = useIsMobile();

  /* ── Auth helpers ── */
  const handleAdminLogin  = (key: string) => { setAdminKey(key); setAdminKeyState(key); setShowAdminLogin(false); };
  const handleAdminLogout = () => { clearAdminKey(); setAdminKeyState(""); };

  /* ── Data fetch ── */
  const fetchAll = async () => {
    try {
      setError("");
      const [dash, pred] = await Promise.all([
        api.dashboard.home(),
        api.ml.predictions(7),
      ]);
      setData(dash);
      setLastSync(dash.overview?.lastUpdated || new Date().toLocaleString());
      setPreds(dash.predictions?.length ? dash.predictions : (pred.data || []));
    } catch (e: unknown) {
      setError(`Cannot reach backend at ${API}. ${e instanceof Error ? e.message : ""}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try { await api.weather.syncAll(); await fetchAll(); } catch { /**/ } finally { setSyncing(false); }
  };

  const runAction = async (action: () => Promise<unknown>) => {
    try { await action(); await fetchAll(); } catch { /**/ }
  };

  useEffect(() => { fetchAll(); }, []);

  /* ── Derived values ── */
  const ov        = data?.overview;
  const worstPred = preds.find(p => p.risk_label === "Extreme") || preds.find(p => p.risk_label === "High");
  const riskLabel = ov?.riskLabel || preds[0]?.risk_label || "Unknown";
  const riskProb  = ov?.riskProbability ?? preds[0]?.risk_probability ?? 0;
  const riskColor = RISK_COLOR[riskLabel] ?? "#888";

  /* ── Spinner while loading ── */
  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading dashboard…</div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{API}</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── Render ── */
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        collapsed={collapsed} setCollapsed={setCollapsed}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Top Bar ── */}
        <header style={{
          padding: isMobile ? "12px 16px" : "14px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)",
          position: "sticky", top: 0, zIndex: 10, gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
                <Menu size={22} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>Dashboard</h1>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={10} /> Lumbini &nbsp;·&nbsp; <Clock size={10} /> {lastSync || "Syncing…"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!isMobile && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 999,
                background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)",
                color: "#9DC88D", fontSize: 12, fontWeight: 600,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#9DC88D", animation: "pulse 2s infinite" }} />
                Live
              </div>
            )}

            {/* Admin toggle */}
            {adminKey ? (
              <div
                onClick={handleAdminLogout}
                title="Click to logout"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  background: "rgba(241,178,74,0.12)", border: "1px solid rgba(241,178,74,0.3)",
                  color: "#F1B24A", fontSize: 12, fontWeight: 600,
                }}
              >
                🔑 Admin
              </div>
            ) : (
              <button
                onClick={() => setShowAdminLogin(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.45)", fontSize: 12,
                }}
              >
                🔒 Admin
              </button>
            )}

            <button
              onClick={() => { if (!isAdmin()) { setShowAdminLogin(true); return; } handleSync(); }}
              disabled={syncing}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: isMobile ? "8px 12px" : "8px 16px",
                borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: syncing ? "not-allowed" : "pointer",
                background: "rgba(241,178,74,0.15)", border: "1px solid rgba(241,178,74,0.3)", color: "#F1B24A",
              }}
            >
              <RefreshCw size={13} style={{ animation: syncing ? "spin 1s linear infinite" : "none" }} />
              {!isMobile && (syncing ? " Syncing…" : " Sync Now")}
            </button>
          </div>
        </header>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {/* Error banner */}
          {error && (
            <div style={{
              padding: "14px 18px", borderRadius: 14,
              display: "flex", alignItems: "flex-start", gap: 12,
              background: "rgba(255,77,77,0.12)", border: "1px solid rgba(255,77,77,0.3)",
              color: "#ff9999", fontSize: 13,
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Backend Error</div>
                <div style={{ opacity: 0.8 }}>{error}</div>
                <div style={{ marginTop: 6, opacity: 0.5, fontSize: 11 }}>
                  API: <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 3 }}>{API}</code>
                </div>
              </div>
            </div>
          )}

          {/* No predictions notice */}
          {!error && preds.length === 0 && (
            <div style={{
              padding: "14px 18px", borderRadius: 14,
              display: "flex", alignItems: "center", gap: 12,
              background: "rgba(241,178,74,0.10)", border: "1px solid rgba(241,178,74,0.3)",
              color: "#F1B24A", fontSize: 13,
            }}>
              <AlertTriangle size={16} />
              <div><strong>No ML predictions yet.</strong> Use Quick Actions → Run ML Prediction to generate the 7-day forecast.</div>
            </div>
          )}

          {/* Risk warning banner */}
          {worstPred && (
            <div style={{
              padding: isMobile ? "14px 16px" : "14px 20px", borderRadius: 16,
              display: "flex", alignItems: isMobile ? "flex-start" : "center",
              justifyContent: "space-between",
              background: RISK_BG[worstPred.risk_label] ?? "rgba(255,140,66,0.18)",
              border: `1px solid ${RISK_COLOR[worstPred.risk_label] ?? "#ff8c42"}40`,
              gap: 12, flexDirection: isMobile ? "column" : "row",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <AlertTriangle size={16} color={RISK_COLOR[worstPred.risk_label]} />
                <span style={{ fontWeight: 700, color: RISK_COLOR[worstPred.risk_label] }}>
                  {RISK_ICON[worstPred.risk_label]} {worstPred.risk_label} Risk
                </span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                  on {worstPred.date} · {Math.round(worstPred.risk_probability * 100)}%
                </span>
              </div>
              <Link
                to="/forecast"
                style={{
                  padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: RISK_COLOR[worstPred.risk_label], color: "#1d241e", whiteSpace: "nowrap",
                }}
              >
                View Forecast
              </Link>
            </div>
          )}

          {/* ── Weather stats row ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 16 }}>
            <StatCard icon={<Thermometer size={18} />} label="Temperature" value={ov?.temperature != null ? ov.temperature.toFixed(1) : "--"} unit="°C"   color="#ff8c42" sub="Today's latest" trend="up" />
            <StatCard icon={<Droplets size={18} />}    label="Humidity"    value={ov?.humidity    != null ? ov.humidity.toFixed(0)    : "--"} unit="%"    color="#60a5fa" sub="Today's latest" />
            <StatCard icon={<Wind size={18} />}        label="Wind"        value={ov?.windSpeed   != null ? ov.windSpeed.toFixed(1)   : "--"} unit="km/h" color="#9DC88D" sub="Today's max" trend="up" />
            <StatCard icon={<CloudRain size={18} />}   label="Rainfall"    value={ov?.rainfall    != null ? ov.rainfall.toFixed(1)    : "--"} unit="mm"   color="#a78bfa" sub="Today's sum" />
          </div>

          {/* ── Status + 7-day forecast ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: isMobile ? 14 : 16 }}>

            {/* Current status card */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Current Status</div>
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 6 }}>Fire Risk Level</div>
                <div style={{ fontSize: isMobile ? 34 : 44, fontWeight: 900, color: riskColor, lineHeight: 1, textShadow: `0 0 30px ${riskColor}50` }}>
                  {riskLabel}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 6 }}>
                  Confidence: {(riskProb * 100).toFixed(0)}%
                </div>
                <RiskBar pct={riskProb} color={riskColor} />
                {riskLabel === "Unknown" && (
                  <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Run ML Prediction to get forecast</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Status",      val: ov?.monitoringStatus ?? "--",      icon: <CheckCircle size={12} />, color: "#9DC88D" },
                  { label: "Data Source", val: ov?.dataSource       ?? "--",      icon: <Database    size={12} />, color: "#60a5fa" },
                  { label: "Alerts",      val: `${ov?.activeAlerts ?? 0} active`, icon: <Bell        size={12} />, color: "#F1B24A" },
                ].map(item => (
                  <div key={item.label} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 12px", borderRadius: 12,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
                      <span style={{ color: item.color }}>{item.icon}</span>{item.label}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 7-day forecast grid */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>7-Day Risk Forecast</div>
                <Link to="/forecast" style={{
                  fontSize: 12, color: "#F1B24A", fontWeight: 600,
                  padding: "4px 10px", borderRadius: 999,
                  background: "rgba(241,178,74,0.12)", border: "1px solid rgba(241,178,74,0.25)",
                }}>
                  Full →
                </Link>
              </div>
              {preds.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No predictions yet.
                  <br />
                  <button
                    onClick={() => runAction(api.ml.predictForecast)}
                    style={{
                      marginTop: 12, padding: "8px 18px", borderRadius: 999, cursor: "pointer",
                      background: "rgba(241,178,74,0.15)", border: "1px solid rgba(241,178,74,0.3)",
                      color: "#F1B24A", fontWeight: 700, fontSize: 13,
                    }}
                  >
                    Run Prediction Now ⚡
                  </button>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(preds.length, 7)}, 1fr)`, gap: isMobile ? 5 : 8 }}>
                  {preds.slice(0, 7).map((p, i) => {
                    const col = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                    return (
                      <div key={i} style={{ textAlign: "center", padding: isMobile ? "8px 4px" : "12px 6px", borderRadius: 14, background: `${col}14`, border: `1px solid ${col}30` }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 4, fontWeight: 600 }}>
                          {new Date(p.date).toLocaleDateString("en", { weekday: "short" })}
                        </div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
                          {new Date(p.date).toLocaleDateString("en", { month: "short", day: "numeric" })}
                        </div>
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

          {/* ── Trends + Areas ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: isMobile ? 14 : 16 }}>

            {/* Weather trends */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 }}>Weather Trends</div>
              {data?.trends?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {([
                    { label: "Temperature (°C)", key: "temperature" as const, color: "#ff8c42" },
                    { label: "Humidity (%)",      key: "humidity"    as const, color: "#60a5fa" },
                    { label: "Wind (km/h)",       key: "windSpeed"   as const, color: "#9DC88D" },
                  ] as const).map(s => (
                    <div key={s.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{s.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>
                          {data.trends[data.trends.length - 1]?.[s.key]?.toFixed(1) ?? "--"}
                        </span>
                      </div>
                      <SparkBar values={data.trends.map(t => t[s.key])} color={s.color} />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  No weather data.
                  <br />
                  <button onClick={handleSync} style={{ marginTop: 12, padding: "8px 18px", borderRadius: 999, cursor: "pointer", background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.3)", color: "#9DC88D", fontWeight: 700, fontSize: 12 }}>
                    Sync Weather
                  </button>
                </div>
              )}
            </div>

            {/* Monitored areas */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Monitored Areas</div>
              {data?.areas?.length ? data.areas.map((area, i) => {
                const col = area.condition === "Critical Watch" ? "#ff4d4d" : area.condition === "Dry Conditions" ? "#F1B24A" : area.condition === "Wind Alert" ? "#ff8c42" : "#9DC88D";
                return (
                  <div key={i} style={{ padding: 14, borderRadius: 16, marginBottom: 10, background: "rgba(255,255,255,0.04)", border: `1px solid ${col}25` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TreePine size={14} color="#9DC88D" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{area.area}</div>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{area.lat?.toFixed(3)}, {area.lng?.toFixed(3)}</div>
                        </div>
                      </div>
                      <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${col}20`, color: col, border: `1px solid ${col}35` }}>
                        {area.condition}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "Temp", val: `${area.avgTemperature?.toFixed(1)}°C`, color: "#ff8c42" },
                        { label: "Hum",  val: `${area.avgHumidity?.toFixed(0)}%`,     color: "#60a5fa" },
                        { label: "Wind", val: `${area.avgWindSpeed?.toFixed(1)}km/h`, color: "#9DC88D" },
                      ].map(m => (
                        <div key={m.label} style={{ textAlign: "center", padding: "7px 4px", borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.val}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 10, padding: "7px 10px", borderRadius: 8, background: `${col}10`, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      ⚡ {area.action}
                    </div>
                  </div>
                );
              }) : <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No area data yet</div>}
            </div>
          </div>

          {/* ── Historical readings table ── */}
          <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px", overflowX: "auto" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Historical Daily Readings</div>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 480 : "auto" }}>
              <thead>
                <tr>
                  {["Date", "Temp", "Humidity", "Wind", "Rainfall", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 600, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.readings?.slice(0, 8).map((r, i) => {
                  const col = r.status === "Critical Watch" ? "#ff4d4d" : r.status === "Dry Conditions" ? "#F1B24A" : r.status === "Wind Alert" ? "#ff8c42" : "#9DC88D";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: 10, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{new Date(r.time).toLocaleDateString("en", { month: "short", day: "numeric" })}</td>
                      <td style={{ padding: 10, fontSize: 13, fontWeight: 700, color: "#ff8c42" }}>{r.temperature?.toFixed(1)}°</td>
                      <td style={{ padding: 10, fontSize: 13, color: "#60a5fa" }}>{r.humidity?.toFixed(0)}%</td>
                      <td style={{ padding: 10, fontSize: 13, color: "#9DC88D" }}>{r.windSpeed?.toFixed(1)}</td>
                      <td style={{ padding: 10, fontSize: 13, color: "#a78bfa" }}>{r.rainfall?.toFixed(1)}</td>
                      <td style={{ padding: 10 }}>
                        <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30` }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                }) ?? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: 28, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                      No readings — sync weather data first
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ── Quick actions ── */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: isMobile ? 14 : 16 }}>

            {/* Action buttons */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Quick Actions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "1. Sync Weather Data",  color: "#9DC88D", icon: <RefreshCw size={14} />, action: api.weather.syncAll       },
                  { label: "2. Run ML Prediction",  color: "#F1B24A", icon: <Cpu       size={14} />, action: api.ml.predictForecast    },
                  { label: "3. Send Risk Alert",    color: "#ff8c42", icon: <Bell      size={14} />, action: () => api.alerts.runEmail("High") },
                  { label: "4. Retrain Model",      color: "#c084fc", icon: <BarChart2 size={14} />, action: api.ml.train              },
                ].map(a => (
                  <button
                    key={a.label}
                    onClick={() => { if (!isAdmin()) { setShowAdminLogin(true); return; } runAction(a.action); }}
                    title={!isAdmin() ? "Admin login required" : undefined}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                      background: isAdmin() ? `${a.color}12` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${isAdmin() ? a.color + "28" : "rgba(255,255,255,0.08)"}`,
                      color: isAdmin() ? a.color : "rgba(255,255,255,0.3)",
                      fontWeight: 600, fontSize: 13, textAlign: "left",
                    }}
                  >
                    {isAdmin() ? a.icon : <span style={{ fontSize: 12 }}>🔒</span>} {a.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
                {isAdmin() ? "💡 Run steps 1→2 in order to populate all data" : "🔒 Admin login required to run actions"}
              </div>
            </div>

            {/* ML model info */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>ML Model</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(241,178,74,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Cpu size={20} color="#F1B24A" />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>XGBoost</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)" }}>Multi-class classifier</div>
                </div>
              </div>
              {[
                { label: "Features", val: "6 weather vars" },
                { label: "Classes",  val: "4 risk levels"  },
                { label: "Data",     val: "60 days"        },
                { label: "Retrain",  val: "Every 30 min"   },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.42)" }}>{item.label}</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{item.val}</span>
                </div>
              ))}
            </div>

            {/* Zone info */}
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Monitoring Zone</div>
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <MapPin size={24} color="#9DC88D" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 4 }}>Lumbini</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>Nepal Forest Zone</div>
              </div>
              {[
                { label: "Latitude",  val: "28.002°N" },
                { label: "Longitude", val: "83.036°E" },
                { label: "Archive",   val: "60 days"  },
                { label: "Forecast",  val: "7 days"   },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: 12 }}>
                  <span style={{ color: "rgba(255,255,255,0.42)" }}>{item.label}</span>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{item.val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Admin Login Modal ── */}
      {showAdminLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "rgba(8,22,18,0.98)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>🔑 Admin Login</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>Enter your admin key to unlock system controls</div>
            <AdminLogin onLogin={handleAdminLogin} onCancel={() => setShowAdminLogin(false)} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg)   } to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1;transform:scale(1) } 50% { opacity:.45;transform:scale(1.35) } }
      `}</style>
    </div>
  );
}