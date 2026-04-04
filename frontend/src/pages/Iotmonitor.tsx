import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wifi, Thermometer, Droplets, Wind, Flame,
  AlertTriangle, CheckCircle, Bell, RefreshCw,
  MapPin, Clock, Battery, Activity, Radio,
  LayoutDashboard, CalendarDays, Menu, X,
  WifiOff, Zap,
} from "lucide-react";
import logo from "../assets/logo.png";

import { API } from "../api";

interface IoTDevice {
  id: string; name: string; location: string; lat: number; lng: number;
  online: boolean; battery: number; lastSeen: string;
  temperature: number; humidity: number; smoke: number; co2: number;
  heatIndex: number; windSpeed: number; fireDetected: boolean;
  smokeAlert: boolean; alertSent: boolean;
}
interface SensorReading {
  device_id: string; recorded_at: string; temperature: number; humidity: number;
  smoke_ppm?: number; co2_ppm?: number; heat_index?: number;
  wind_speed?: number; fire_detected?: boolean;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

function statusColor(d: IoTDevice) {
  if (!d.online) return "#666";
  if (d.fireDetected) return "#ff4d4d";
  if (d.smokeAlert)   return "#ff8c42";
  return "#9DC88D";
}
function batteryColor(pct: number) { return pct > 60 ? "#9DC88D" : pct > 25 ? "#F1B24A" : "#ff4d4d"; }
function smokePpmColor(ppm: number) { return ppm > 300 ? "#ff4d4d" : ppm > 150 ? "#ff8c42" : ppm > 60 ? "#F1B24A" : "#9DC88D"; }
function smokeLabel(ppm: number) { return ppm > 300 ? "DANGER" : ppm > 150 ? "HIGH" : ppm > 60 ? "ELEVATED" : "NORMAL"; }

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

function MiniGauge({ value, max, color, label, unit }: { value: number; max: number; color: string; label: string; unit: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
      <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto" }}>
        <svg viewBox="0 0 64 64" style={{ width: 56, height: 56, transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${2 * Math.PI * 26}`} strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color, lineHeight: 1 }}>{Math.round(value)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>{unit}</div>
        </div>
      </div>
    </div>
  );
}

export default function IoTMonitor() {
  const [devices, setDevices]         = useState<IoTDevice[]>([]);
  const [readings, setReadings]       = useState<SensorReading[]>([]);
  const [loading, setLoading]         = useState(true);
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [alertMsg, setAlertMsg]       = useState("");
  const [sendingAlert, setSendingAlert] = useState(false);
  const [lastRefresh, setLastRefresh] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showDetail, setShowDetail]   = useState(false);
  const alertedRef = useRef<Set<string>>(new Set());
  const isMobile = useIsMobile();

  const fetchDevices = async () => {
    try {
      const sensorRes = await fetch(`${API}/api/sensor/readings?limit=50`);
      if (sensorRes.ok) {
        const data = await sensorRes.json();
        const raw: SensorReading[] = data.data || data.readings || [];
        setReadings(raw);
        const grouped: Record<string, SensorReading[]> = {};
        raw.forEach(r => { if (!grouped[r.device_id]) grouped[r.device_id] = []; grouped[r.device_id].push(r); });
        const deviceList: IoTDevice[] = Object.entries(grouped).map(([id, rows], idx) => {
          const latest = rows[0];
          const smoke  = latest.smoke_ppm ?? 0;
          const co2    = latest.co2_ppm   ?? 400;
          const fireDetected = latest.fire_detected ?? (smoke > 300);
          return { id, name: `Sensor Node ${idx + 1}`, location: `Zone ${String.fromCharCode(65 + idx)}`, lat: 28.002 + idx * 0.01, lng: 83.036 + idx * 0.01, online: true, battery: 100 - (idx * 11) % 70, lastSeen: latest.recorded_at, temperature: latest.temperature, humidity: latest.humidity, smoke, co2, heatIndex: latest.heat_index ?? latest.temperature + 2, windSpeed: latest.wind_speed ?? 0, fireDetected, smokeAlert: smoke > 150 && !fireDetected, alertSent: alertedRef.current.has(id) };
        });
        setDevices(deviceList);
        const fireDevices = deviceList.filter(d => d.fireDetected && !alertedRef.current.has(d.id));
        if (fireDevices.length > 0) { fireDevices.forEach(d => alertedRef.current.add(d.id)); await sendFireAlertEmail(fireDevices); }
      } else { setDevices(getDemoDevices()); }
    } catch { setDevices(getDemoDevices()); }
    finally { setLoading(false); setLastRefresh(new Date().toLocaleTimeString()); }
  };

  const sendFireAlertEmail = async (alertDevices: IoTDevice[]) => {
    try {
      const deviceNames = alertDevices.map(d => `${d.name} (${d.location})`).join(", ");
      await fetch(`${API}/api/alerts/run-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minRisk: "High", note: `🔥 FIRE DETECTED by IoT: ${deviceNames}` }) });
      setAlertMsg(`🔥 FIRE DETECTED — Auto-alert sent for: ${deviceNames}`);
    } catch { setAlertMsg("⚠️ Fire detected — failed to send auto-alert."); }
  };

  const manualAlert = async () => { setSendingAlert(true); try { const res = await fetch(`${API}/api/alerts/run-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minRisk: "High" }) }); const data = await res.json(); setAlertMsg(data.sent ? `✅ Manual alert sent — ${data.alerts} day(s)` : `ℹ️ ${data.message}`); } catch { setAlertMsg("❌ Failed to send alert"); } finally { setSendingAlert(false); } };
  const testAlert   = async () => { setSendingAlert(true); try { await fetch(`${API}/api/alerts/test-email`, { method: "POST" }); setAlertMsg("✅ Test email sent"); } catch { setAlertMsg("❌ Test email failed"); } finally { setSendingAlert(false); } };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onlineCount = devices.filter(d => d.online).length;
  const alertCount  = devices.filter(d => d.fireDetected || d.smokeAlert).length;
  const fireCount   = devices.filter(d => d.fireDetected).length;
  const selectedDev = devices.find(d => d.id === selectedDevice) ?? devices[0] ?? null;

  const card = (extra?: React.CSSProperties) => ({ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 20, padding: "18px 20px", ...extra });

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading IoT devices…</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><Menu size={22} /></button>}
            <div>
              <h1 style={{ fontSize: isMobile ? 15 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>IoT Sensor Monitor</h1>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <Wifi size={10} /> {onlineCount}/{devices.length} online &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading…"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={fetchDevices} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", color: "#9DC88D", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <RefreshCw size={12} />{!isMobile && " Refresh"}
            </button>
            <button onClick={testAlert} disabled={sendingAlert} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Zap size={12} />{!isMobile && " Test"}
            </button>
            <button onClick={manualAlert} disabled={sendingAlert} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(255,140,66,0.15)", border: "1px solid rgba(255,140,66,0.3)", color: "#ff8c42", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Bell size={12} style={{ animation: sendingAlert ? "spin 1s linear infinite" : "none" }} />
              {!isMobile && (sendingAlert ? " Sending…" : " Alert")}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: isMobile ? "16px" : "24px", display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {alertMsg && (
            <div style={{ padding: "12px 16px", borderRadius: 14, background: alertMsg.startsWith("🔥") ? "rgba(255,77,77,0.15)" : alertMsg.startsWith("✅") ? "rgba(157,200,141,0.12)" : "rgba(241,178,74,0.12)", border: `1px solid ${alertMsg.startsWith("🔥") ? "rgba(255,77,77,0.35)" : "rgba(157,200,141,0.3)"}`, color: "#fff", fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
              {alertMsg.startsWith("🔥") ? <Flame size={16} color="#ff4d4d" /> : alertMsg.startsWith("✅") ? <CheckCircle size={16} color="#9DC88D" /> : <AlertTriangle size={16} color="#F1B24A" />}
              <span style={{ flex: 1 }}>{alertMsg}</span>
              <button onClick={() => setAlertMsg("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          )}

          {fireCount > 0 && (
            <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderRadius: 18, background: "rgba(255,44,44,0.18)", border: "2px solid rgba(255,77,77,0.5)", display: "flex", alignItems: "center", gap: 14, animation: "pulse 1.5s ease-in-out infinite" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,77,77,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Flame size={24} color="#ff4d4d" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: isMobile ? 14 : 18, fontWeight: 900, color: "#ff4d4d" }}>🔥 FIRE DETECTED — {fireCount} SENSOR{fireCount > 1 ? "S" : ""}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>{devices.filter(d => d.fireDetected).map(d => `${d.name} @ ${d.location}`).join(" · ")}</div>
              </div>
            </div>
          )}

          {/* Stats — 2x2 on mobile, 4 cols on desktop */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 14 }}>
            {[
              { label: "Total Devices", val: devices.length, color: "#60a5fa", icon: <Radio size={18} /> },
              { label: "Online",        val: onlineCount,    color: "#9DC88D", icon: <Wifi size={18} /> },
              { label: "Active Alerts", val: alertCount,     color: "#ff8c42", icon: <AlertTriangle size={18} /> },
              { label: "Fire Detected", val: fireCount,      color: "#ff4d4d", icon: <Flame size={18} /> },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${s.val > 0 && s.color !== "#60a5fa" && s.color !== "#9DC88D" ? s.color + "35" : "rgba(255,255,255,0.09)"}`, borderRadius: 18, padding: "16px" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Mobile: list + tap to see detail */}
          {isMobile ? (
            <>
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Sensor Nodes</div>
                {devices.length === 0 ? <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No sensor data available</div> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col    = statusColor(d);
                      const active = selectedDevice === d.id;
                      return (
                        <div key={d.id} onClick={() => { setSelectedDevice(d.id); setShowDetail(true); }}
                          style={{ padding: "14px", borderRadius: 14, cursor: "pointer", background: active ? `${col}12` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? col + "40" : "rgba(255,255,255,0.07)"}` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 11, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {d.online ? <Wifi size={16} color={col} /> : <WifiOff size={16} color="#666" />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{d.name}</div>
                                <div style={{ display: "flex", gap: 5 }}>
                                  {d.fireDetected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,0.2)", color: "#ff4d4d", fontWeight: 700 }}>FIRE</span>}
                                  {d.smokeAlert   && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,0.2)", color: "#ff8c42", fontWeight: 700 }}>SMOKE</span>}
                                </div>
                              </div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{d.location}</div>
                              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, flexWrap: "wrap" }}>
                                <span style={{ color: "#ff8c42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                                <span style={{ color: "#60a5fa" }}>{d.humidity.toFixed(0)}%</span>
                                <span style={{ color: smokePpmColor(d.smoke) }}>💨 {d.smoke}ppm</span>
                                <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}><Battery size={10} />{d.battery}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mobile device detail modal */}
              {showDetail && selectedDev && (
                <>
                  <div onClick={() => setShowDetail(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, backdropFilter: "blur(4px)" }} />
                  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "rgba(8,22,18,0.98)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{selectedDev.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{selectedDev.location}</div>
                      </div>
                      <button onClick={() => setShowDetail(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}><X size={18} /></button>
                    </div>

                    {/* Gauges */}
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
                      <MiniGauge value={selectedDev.temperature} max={60}   color="#ff8c42" label="Temp"  unit="°C" />
                      <MiniGauge value={selectedDev.humidity}    max={100}  color="#60a5fa" label="Hum"   unit="%" />
                      <MiniGauge value={selectedDev.smoke}       max={500}  color={smokePpmColor(selectedDev.smoke)} label="Smoke" unit="ppm" />
                      <MiniGauge value={selectedDev.windSpeed}   max={80}   color="#9DC88D" label="Wind"  unit="km/h" />
                    </div>

                    {/* Status items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "Fire Detection", active: selectedDev.fireDetected, color: "#ff4d4d", msg: selectedDev.fireDetected ? "🔥 FIRE DETECTED" : "✓ No fire", icon: <Flame size={14} /> },
                        { label: "Smoke Alert",    active: selectedDev.smokeAlert,   color: "#ff8c42", msg: selectedDev.smokeAlert ? `⚠ ${smokeLabel(selectedDev.smoke)} (${selectedDev.smoke}ppm)` : `✓ Normal (${selectedDev.smoke}ppm)`, icon: <AlertTriangle size={14} /> },
                        { label: "Battery",        active: selectedDev.battery < 25, color: "#ff4d4d", msg: selectedDev.battery < 25 ? `⚡ Low: ${selectedDev.battery}%` : `✓ OK: ${selectedDev.battery}%`, icon: <Battery size={14} /> },
                      ].map(st => (
                        <div key={st.label} style={{ padding: "12px 14px", borderRadius: 12, background: st.active ? `${st.color}12` : "rgba(157,200,141,0.07)", border: `1px solid ${st.active ? st.color + "35" : "rgba(157,200,141,0.2)"}`, display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ color: st.active ? st.color : "#9DC88D" }}>{st.icon}</div>
                          <div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>{st.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: st.active ? st.color : "#9DC88D" }}>{st.msg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Desktop: side-by-side list + detail */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 20 }}>
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Sensor Nodes</div>
                {devices.length === 0 ? <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No sensor data available</div> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col    = statusColor(d);
                      const active = selectedDevice === d.id || (!selectedDevice && d === devices[0]);
                      return (
                        <div key={d.id} onClick={() => setSelectedDevice(d.id)} style={{ padding: "14px 16px", borderRadius: 14, cursor: "pointer", background: active ? `${col}12` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? col + "40" : "rgba(255,255,255,0.07)"}`, display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{d.online ? <Wifi size={17} color={col} /> : <WifiOff size={17} color="#666" />}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                                {d.fireDetected && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,0.2)", color: "#ff4d4d", fontWeight: 700 }}>FIRE</span>}
                                {d.smokeAlert   && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,0.2)", color: "#ff8c42", fontWeight: 700 }}>SMOKE</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{d.location} · {d.lat.toFixed(3)}°N</div>
                            <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12 }}>
                              <span style={{ color: "#ff8c42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                              <span style={{ color: "#60a5fa" }}>{d.humidity.toFixed(0)}%</span>
                              <span style={{ color: smokePpmColor(d.smoke) }}>💨 {d.smoke}ppm</span>
                              <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}><Battery size={10} />{d.battery}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedDev ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ ...card(), border: `1px solid ${statusColor(selectedDev)}35` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{selectedDev.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={10} /> {selectedDev.location} · {selectedDev.lat.toFixed(4)}°N</div>
                      </div>
                      <span style={{ padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: selectedDev.online ? "rgba(157,200,141,0.15)" : "rgba(100,100,100,0.15)", color: selectedDev.online ? "#9DC88D" : "#888", border: `1px solid ${selectedDev.online ? "rgba(157,200,141,0.3)" : "rgba(100,100,100,0.3)"}` }}>
                        {selectedDev.online ? "● Online" : "○ Offline"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <MiniGauge value={selectedDev.temperature} max={60}   color="#ff8c42" label="Temp"  unit="°C" />
                      <MiniGauge value={selectedDev.humidity}    max={100}  color="#60a5fa" label="Hum"   unit="%" />
                      <MiniGauge value={selectedDev.smoke}       max={500}  color={smokePpmColor(selectedDev.smoke)} label="Smoke" unit="ppm" />
                      <MiniGauge value={selectedDev.windSpeed}   max={80}   color="#9DC88D" label="Wind"  unit="km/h" />
                      <MiniGauge value={selectedDev.co2}         max={2000} color="#a78bfa" label="CO₂"   unit="ppm" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 14 }}>
                      {[
                        { label: "Temperature", val: `${selectedDev.temperature.toFixed(1)}°C`, color: "#ff8c42", icon: <Thermometer size={12} /> },
                        { label: "Humidity",    val: `${selectedDev.humidity.toFixed(0)}%`,     color: "#60a5fa", icon: <Droplets size={12} /> },
                        { label: "Heat Index",  val: `${selectedDev.heatIndex.toFixed(1)}°C`,   color: "#F1B24A", icon: <Activity size={12} /> },
                        { label: "Wind Speed",  val: `${selectedDev.windSpeed.toFixed(1)}km/h`, color: "#9DC88D", icon: <Wind size={12} /> },
                        { label: "Smoke PPM",   val: `${selectedDev.smoke}ppm`,                 color: smokePpmColor(selectedDev.smoke), icon: <Flame size={12} /> },
                        { label: "CO₂ PPM",    val: `${selectedDev.co2}ppm`,                   color: "#a78bfa", icon: <Radio size={12} /> },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${s.color}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: s.color }}>{s.icon}<span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{s.label}</span></div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ ...card(), padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Detection Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "Fire Detection", active: selectedDev.fireDetected, color: "#ff4d4d", msg: selectedDev.fireDetected ? "🔥 FIRE DETECTED" : "✓ No fire detected", icon: <Flame size={14} /> },
                        { label: "Smoke Alert",    active: selectedDev.smokeAlert,   color: "#ff8c42", msg: selectedDev.smokeAlert ? `⚠ Smoke ${smokeLabel(selectedDev.smoke)} (${selectedDev.smoke}ppm)` : `✓ Smoke normal (${selectedDev.smoke}ppm)`, icon: <AlertTriangle size={14} /> },
                        { label: "Battery",        active: selectedDev.battery < 25, color: "#ff4d4d", msg: selectedDev.battery < 25 ? `⚡ Low battery: ${selectedDev.battery}%` : `✓ Battery OK: ${selectedDev.battery}%`, icon: <Battery size={14} /> },
                      ].map(st => (
                        <div key={st.label} style={{ padding: "11px 14px", borderRadius: 12, background: st.active ? `${st.color}12` : "rgba(157,200,141,0.07)", border: `1px solid ${st.active ? st.color + "35" : "rgba(157,200,141,0.2)"}`, display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ color: st.active ? st.color : "#9DC88D" }}>{st.icon}</div>
                          <div>
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>{st.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: st.active ? st.color : "#9DC88D" }}>{st.msg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ ...card(), display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                  <Wifi size={32} color="rgba(255,255,255,0.15)" />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Select a device to view details</div>
                </div>
              )}
            </div>
          )}

          {/* Readings table */}
          {readings.length > 0 && (
            <div style={card()}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>Recent Sensor Readings</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
                  <thead>
                    <tr>{["Time", "Device", "Temp", "Humidity", "Smoke", "Fire"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 600, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 12).map((r, i) => {
                      const smoke     = r.smoke_ppm ?? 0;
                      const fireColor = r.fire_detected ? "#ff4d4d" : smoke > 150 ? "#ff8c42" : "#9DC88D";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{new Date(r.recorded_at).toLocaleTimeString()}</td>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{r.device_id}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#ff8c42" }}>{r.temperature?.toFixed(1)}°C</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#60a5fa" }}>{r.humidity?.toFixed(0)}%</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: smokePpmColor(smoke) }}>{smoke}</td>
                          <td style={{ padding: "9px 10px" }}><span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${fireColor}18`, color: fireColor, border: `1px solid ${fireColor}30` }}>{r.fire_detected ? "YES" : smoke > 150 ? "SMOKE" : "CLEAR"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {devices.length > 0 && devices[0].id.startsWith("DEMO") && (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
              <strong style={{ color: "#60a5fa" }}>ℹ Demo Mode:</strong> Showing sample data. Connect real IoT sensors via <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>POST /api/sensor/ingest</code>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.05)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.12); border-radius:3px; }
      `}</style>
    </div>
  );
}

function getDemoDevices(): IoTDevice[] {
  return [
    { id: "DEMO-001", name: "Sensor Node 1", location: "Zone A — East Forest",      lat: 28.002, lng: 83.036, online: true,  battery: 87, lastSeen: new Date().toISOString(), temperature: 34.5, humidity: 42, smoke: 18,  co2: 412, heatIndex: 37.2, windSpeed: 12.3, fireDetected: false, smokeAlert: false, alertSent: false },
    { id: "DEMO-002", name: "Sensor Node 2", location: "Zone B — North Ridge",      lat: 28.013, lng: 83.047, online: true,  battery: 54, lastSeen: new Date().toISOString(), temperature: 38.1, humidity: 28, smoke: 180, co2: 510, heatIndex: 41.5, windSpeed: 19.8, fireDetected: false, smokeAlert: true,  alertSent: false },
    { id: "DEMO-003", name: "Sensor Node 3", location: "Zone C — West Buffer",      lat: 28.021, lng: 83.025, online: true,  battery: 22, lastSeen: new Date().toISOString(), temperature: 41.7, humidity: 19, smoke: 340, co2: 780, heatIndex: 46.3, windSpeed: 25.1, fireDetected: true,  smokeAlert: false, alertSent: false },
    { id: "DEMO-004", name: "Sensor Node 4", location: "Zone D — South Perimeter",  lat: 27.994, lng: 83.042, online: true,  battery: 8,  lastSeen: new Date(Date.now() - 2*60*60*1000).toISOString(), temperature: 29.3, humidity: 58, smoke: 22, co2: 395, heatIndex: 30.1, windSpeed: 7.2, fireDetected: false, smokeAlert: false, alertSent: false },
  ];
}