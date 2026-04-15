/**
 * Iotmonitor.tsx — IoT Sensor Monitor
 * Shows ESP32 sensor nodes: fire, CO₂, rain, soil, battery.
 * Auto-refreshes every 30 s. Falls back to demo data when offline.
 */
import { useEffect, useState, useRef } from "react";
import {
  Wifi, Thermometer, Droplets, Flame,
  AlertTriangle, CheckCircle, Bell, RefreshCw,
  MapPin, Clock, Battery, Radio,
  Menu, WifiOff, Zap, CloudRain, Leaf, X,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { useIsMobile } from "../hooks/useIsMobile";
import { api } from "../api";
import type { SensorReading } from "../api";

/* ── Types ─────────────────────────────────────────────────── */
interface IoTDevice {
  id: string; name: string; location: string; lat: number; lng: number;
  online: boolean; battery: number; lastSeen: string;
  temperature: number; humidity: number; heatIndex: number;
  co2: number; smokePpm: number;
  rainValue: number; isRaining: boolean;
  soilMoisture: number; soilDry: boolean;
  fireDetected: boolean; smokeAlert: boolean; alertSent: boolean;
}

/* ── Colour helpers ─────────────────────────────────────────── */
const statusColor  = (d: IoTDevice) => !d.online ? "#666" : d.fireDetected ? "#FF4D4D" : d.smokeAlert ? "#FF8C42" : d.isRaining ? "#60A5FA" : "#9DC88D";
const batteryColor = (p: number)    => p > 60 ? "#9DC88D" : p > 25 ? "#F1B24A" : "#FF4D4D";
const co2Color     = (v: number)    => v > 800 ? "#FF4D4D" : v > 600 ? "#FF8C42" : v > 400 ? "#F1B24A" : "#9DC88D";
const co2Label     = (v: number)    => v > 800 ? "DANGER" : v > 600 ? "HIGH" : v > 400 ? "ELEVATED" : "NORMAL";
const soilColor    = (v: number)    => v < 20 ? "#FF4D4D" : v < 50 ? "#F1B24A" : "#9DC88D";
const soilLabel    = (v: number)    => v < 20 ? "DRY" : v < 50 ? "LOW" : v < 80 ? "OK" : "WET";
const rainLabel    = (v: number)    => v < 200 ? "HEAVY" : v < 500 ? "LIGHT" : "NONE";

/* ── Circular gauge ─────────────────────────────────────────── */
function MiniGauge({ value, max, color, label, unit }: { value: number; max: number; color: string; label: string; unit: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const R = 26, C = 2 * Math.PI * R;
  return (
    <div style={{ textAlign: "center" }}>
      <div className="label-caps" style={{ marginBottom: 4, fontSize: 9 }}>{label}</div>
      <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto" }}>
        <svg viewBox="0 0 64 64" style={{ width: 56, height: 56, transform: "rotate(-90deg)" }}>
          <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="6" />
          <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset .8s ease" }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color, lineHeight: 1 }}>{Math.round(value)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,.35)" }}>{unit}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Build device from grouped readings ─────────────────────── */
function buildDevice(id: string, rows: SensorReading[], idx: number): IoTDevice {
  const byType: Record<string, number>  = {};
  const byBool: Record<string, boolean> = {};
  rows.forEach(r => {
    byType[r.sensor_type.toLowerCase()] = r.value;
    if (r.fire_detected !== undefined) byBool.fire     = r.fire_detected;
    if (r.is_raining    !== undefined) byBool.rain     = r.is_raining;
    if (r.soil_dry      !== undefined) byBool.soil_dry = r.soil_dry;
  });
  const temp  = byType.temperature ?? byType.temp ?? rows[0]?.temperature ?? 0;
  const hum   = byType.humidity    ?? byType.hum  ?? rows[0]?.humidity    ?? 0;
  const co2   = byType.co2         ?? rows[0]?.co2_ppm ?? 400;
  const smoke = byType.smoke       ?? byType.mq135 ?? co2;
  const rain  = byType.rain        ?? byType.rainfall  ?? byType.yl83 ?? rows[0]?.rain_value ?? 1023;
  const soil  = byType.soil        ?? byType.moisture   ?? rows[0]?.soil_moisture ?? 50;
  return {
    id, name: `ESP32 Node ${idx + 1}`,
    location: `Zone ${String.fromCharCode(65 + idx)} — Lumbini Forest`,
    lat: 28.002 + idx * 0.01, lng: 83.036 + idx * 0.01,
    online: true, battery: 100 - (idx * 11) % 70,
    lastSeen: rows[0]?.recorded_at ?? new Date().toISOString(),
    temperature: temp, humidity: hum,
    heatIndex: temp + (hum > 60 ? (hum - 60) * 0.1 : 0),
    co2, smokePpm: smoke,
    rainValue: rain, isRaining: byBool.rain ?? rain < 500,
    soilMoisture: soil, soilDry: byBool.soil_dry ?? soil < 20,
    fireDetected: byBool.fire ?? (smoke > 300 || co2 > 800),
    smokeAlert:   smoke > 150 && !(byBool.fire ?? false),
    alertSent: false,
  };
}

/* ── Demo fallback ──────────────────────────────────────────── */
function getDemoDevices(): IoTDevice[] {
  return [
    { id:"DEMO-001",name:"ESP32 Node 1",location:"Zone A — East Forest",  lat:28.002,lng:83.036,online:true, battery:87,lastSeen:new Date().toISOString(),temperature:34.5,humidity:42, heatIndex:36.2,co2:412,smokePpm:18, rainValue:900, isRaining:false,soilMoisture:65,soilDry:false,fireDetected:false,smokeAlert:false,alertSent:false},
    { id:"DEMO-002",name:"ESP32 Node 2",location:"Zone B — North Ridge",  lat:28.013,lng:83.047,online:true, battery:54,lastSeen:new Date().toISOString(),temperature:38.1,humidity:28, heatIndex:40.5,co2:620,smokePpm:180,rainValue:1020,isRaining:false,soilMoisture:20,soilDry:true, fireDetected:false,smokeAlert:true, alertSent:false},
    { id:"DEMO-003",name:"ESP32 Node 3",location:"Zone C — West Buffer",  lat:28.021,lng:83.025,online:true, battery:22,lastSeen:new Date().toISOString(),temperature:41.7,humidity:19, heatIndex:43.3,co2:850,smokePpm:340,rainValue:1023,isRaining:false,soilMoisture:10,soilDry:true, fireDetected:true, smokeAlert:false,alertSent:false},
    { id:"DEMO-004",name:"ESP32 Node 4",location:"Zone D — South Path",   lat:27.994,lng:83.042,online:true, battery:91,lastSeen:new Date().toISOString(),temperature:26.3,humidity:78, heatIndex:27.1,co2:390,smokePpm:12, rainValue:120,  isRaining:true, soilMoisture:90,soilDry:false,fireDetected:false,smokeAlert:false,alertSent:false},
  ];
}

/* ── Main ───────────────────────────────────────────────────── */
export default function IoTMonitor() {
  const [devices,       setDevices]       = useState<IoTDevice[]>([]);
  const [readings,      setReadings]      = useState<SensorReading[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [collapsed,     setCollapsed]     = useState(false);
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [alertMsg,      setAlertMsg]      = useState("");
  const [sendingAlert,  setSendingAlert]  = useState(false);
  const [lastRefresh,   setLastRefresh]   = useState("");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [showSheet,     setShowSheet]     = useState(false);
  const [iotPrediction, setIotPrediction] = useState<{ risk_label: string; risk_code: number; risk_probability: number } | null>(null);
  const [predicting,    setPredicting]    = useState(false);
  const alertedRef = useRef<Set<string>>(new Set());
  const isMobile = useIsMobile();

  const fetchDevices = async () => {
    try {
      const res = await api.sensor.readings(100);
      const raw = res.data || [];
      setReadings(raw);
      const grouped: Record<string, SensorReading[]> = {};
      raw.forEach(r => { (grouped[r.device_id] = grouped[r.device_id] || []).push(r); });
      const list = Object.entries(grouped).map(([id, rows], i) => buildDevice(id, rows, i));
      setDevices(list);
      const fire = list.filter(d => d.fireDetected && !alertedRef.current.has(d.id));
      if (fire.length) {
        fire.forEach(d => alertedRef.current.add(d.id));
        const names = fire.map(d => `${d.name} (${d.location})`).join(", ");
        await api.alerts.runEmail("High", [], `🔥 FIRE/SMOKE DETECTED: ${names}`);
        setAlertMsg(`🔥 FIRE DETECTED — Auto-alert sent for: ${names}`);
      }
    } catch {
      setDevices(getDemoDevices());
    } finally { setLoading(false); setLastRefresh(new Date().toLocaleTimeString()); }
  };

  const manualAlert = async () => {
    setSendingAlert(true);
    try { const d = await api.alerts.runEmail("High"); setAlertMsg(d.sent ? `✅ Manual alert sent — ${d.alerts} day(s)` : `ℹ️ ${d.message}`); }
    catch { setAlertMsg("❌ Failed to send alert"); } finally { setSendingAlert(false); }
  };

  /* ── IoT-based prediction ── */
  const predictFromIoT = async () => {
    setPredicting(true);
    setAlertMsg("Running IoT sensor prediction…");
    try {
      const res = await fetch(
        `${(import.meta.env.VITE_API_URL as string || "http://localhost:3000")}/api/ml/predict-iot`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const data = await res.json();
      if (data.ok && data.prediction) {
        const p = data.prediction;
        setIotPrediction({ risk_label: p.risk_label, risk_code: p.risk_code, risk_probability: p.risk_probability });
        setAlertMsg(`✅ IoT Prediction: ${p.risk_label} risk (${(p.risk_probability * 100).toFixed(0)}% confidence)`);
      } else {
        setAlertMsg(`❌ Prediction failed: ${data.message ?? "Check backend logs"}`);
      }
    } catch {
      setAlertMsg("❌ Cannot reach backend for IoT prediction");
    } finally {
      setPredicting(false);
    }
  };

  const testAlert = async () => {
    setSendingAlert(true);
    try { await api.alerts.testEmail(); setAlertMsg("✅ Test email sent"); }
    catch { setAlertMsg("❌ Test email failed"); } finally { setSendingAlert(false); }
  };

  useEffect(() => {
    fetchDevices();
    const t = setInterval(fetchDevices, 30_000);
    return () => clearInterval(t);
  }, []);

  const onlineCount = devices.filter(d => d.online).length;
  const fireCount   = devices.filter(d => d.fireDetected).length;
  const rainCount   = devices.filter(d => d.isRaining).length;
  const alertCount  = devices.filter(d => d.smokeAlert || d.fireDetected).length;
  const selectedDev = devices.find(d => d.id === selectedId) ?? devices[0] ?? null;

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.09)", borderRadius: 20, padding: "18px 20px", ...extra });

  /* ── Status rows for device detail ── */
  const statusRows = (d: IoTDevice) => [
    { label: "Fire Detection",    active: d.fireDetected,  color: "#FF4D4D", msg: d.fireDetected   ? "🔥 FIRE DETECTED — Emergency alert sent"                  : "✓ No fire detected",             icon: <Flame    size={14} /> },
    { label: "CO₂ / Air Quality", active: d.co2 > 600,     color: "#FF8C42", msg: `${co2Label(d.co2)} — ${d.co2} ppm`,                                                                                icon: <Radio    size={14} /> },
    { label: "Rain Detection",    active: d.isRaining,     color: "#60A5FA", msg: d.isRaining      ? `🌧 Rain detected (raw: ${d.rainValue})`                    : "✓ No rain",                     icon: <CloudRain size={14} /> },
    { label: "Soil Condition",    active: d.soilDry,       color: "#F1B24A", msg: `${soilLabel(d.soilMoisture)} — ${d.soilMoisture.toFixed(0)}% moisture`,                                             icon: <Leaf     size={14} /> },
    { label: "Battery",           active: d.battery < 25,  color: "#FF4D4D", msg: d.battery < 25   ? `⚡ Low: ${d.battery}%`                                     : `✓ OK: ${d.battery}%`,           icon: <Battery  size={14} /> },
  ];

  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div className="spinner" />
        <div style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>Loading IoT devices…</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* ── Top bar ── */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}><Menu size={22} /></button>}
            <div>
              <h1 style={{ fontSize: isMobile ? 15 : 20, fontWeight: 800, margin: 0 }}>IoT Sensor Monitor</h1>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <Wifi size={10} /> {onlineCount}/{devices.length} online &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading…"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-green"  onClick={fetchDevices}><RefreshCw size={12} />{!isMobile && " Refresh"}</button>
            <button className="btn btn-amber"  onClick={predictFromIoT} disabled={predicting} title="Predict fire risk from current sensor readings">
              {predicting
                ? <><RefreshCw size={12} className="spin" />{!isMobile && " Predicting…"}</>
                : <>{!isMobile ? "🧠 Predict Risk" : "🧠"}</>}
            </button>
            <button className="btn btn-blue"   onClick={testAlert}    disabled={sendingAlert}><Zap  size={12} />{!isMobile && " Test"}</button>
            <button className="btn btn-orange" onClick={manualAlert}  disabled={sendingAlert}>
              <Bell size={12} style={{ animation: sendingAlert ? "spin .8s linear infinite" : "none" }} />
              {!isMobile && (sendingAlert ? " Sending…" : " Alert")}
            </button>
          </div>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {/* IoT Prediction result banner */}
          {iotPrediction && (
            <div style={{
              padding: "14px 18px", borderRadius: 16,
              background: iotPrediction.risk_code >= 3 ? "rgba(255,77,77,.15)" : iotPrediction.risk_code >= 2 ? "rgba(255,140,66,.15)" : "rgba(157,200,141,.12)",
              border: `1px solid ${iotPrediction.risk_code >= 3 ? "rgba(255,77,77,.35)" : iotPrediction.risk_code >= 2 ? "rgba(255,140,66,.35)" : "rgba(157,200,141,.3)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 28 }}>
                  {iotPrediction.risk_code >= 3 ? "🔴" : iotPrediction.risk_code >= 2 ? "🟠" : iotPrediction.risk_code >= 1 ? "🟡" : "🟢"}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: iotPrediction.risk_code >= 2 ? "#FF8C42" : "#9DC88D" }}>
                    IoT Prediction: {iotPrediction.risk_label} Risk
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 2 }}>
                    Confidence: {(iotPrediction.risk_probability * 100).toFixed(0)}% · Based on live ESP32 sensor readings · Stored separately from weather forecast
                  </div>
                </div>
              </div>
              <button onClick={() => setIotPrediction(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          )}

          {/* Alert banner */}
          {alertMsg && (
            <div style={{ padding: "12px 16px", borderRadius: 14, fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 8, background: alertMsg.startsWith("🔥") ? "rgba(255,77,77,.15)" : alertMsg.startsWith("✅") ? "rgba(157,200,141,.12)" : "rgba(241,178,74,.12)", border: `1px solid ${alertMsg.startsWith("🔥") ? "rgba(255,77,77,.35)" : "rgba(157,200,141,.3)"}` }}>
              {alertMsg.startsWith("🔥") ? <Flame size={16} color="#FF4D4D" /> : alertMsg.startsWith("✅") ? <CheckCircle size={16} color="#9DC88D" /> : <AlertTriangle size={16} color="#F1B24A" />}
              <span style={{ flex: 1 }}>{alertMsg}</span>
              <button onClick={() => setAlertMsg("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,.4)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          )}

          {/* Fire emergency banner */}
          {fireCount > 0 && (
            <div style={{ padding: "18px 24px", borderRadius: 18, background: "rgba(255,44,44,.18)", border: "2px solid rgba(255,77,77,.5)", display: "flex", alignItems: "center", gap: 14, animation: "glow 1.5s ease-in-out infinite" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,77,77,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Flame size={24} color="#FF4D4D" />
              </div>
              <div>
                <div style={{ fontSize: isMobile ? 14 : 18, fontWeight: 900, color: "#FF4D4D" }}>🔥 FIRE DETECTED — {fireCount} SENSOR{fireCount > 1 ? "S" : ""} TRIGGERED</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,.65)", marginTop: 4 }}>{devices.filter(d => d.fireDetected).map(d => `${d.name} @ ${d.location}`).join(" · ")}</div>
              </div>
            </div>
          )}

          {/* Summary stats */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 14 }}>
            {[
              { label: "Devices Online", val: `${onlineCount}/${devices.length}`, color: "#9DC88D", icon: <Wifi size={18} /> },
              { label: "Fire Alerts",    val: fireCount,  color: "#FF4D4D", icon: <Flame       size={18} /> },
              { label: "Rain Detected",  val: rainCount,  color: "#60A5FA", icon: <CloudRain   size={18} /> },
              { label: "Active Alerts",  val: alertCount, color: "#FF8C42", icon: <AlertTriangle size={18} /> },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${typeof s.val === "number" && s.val > 0 && s.color !== "#9DC88D" ? s.color + "35" : "rgba(255,255,255,.09)"}`, borderRadius: 18, padding: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 10 }}>{s.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Device list + detail */}
          {isMobile ? (
            /* Mobile: tappable list → bottom sheet */
            <>
              <div style={card()}>
                <div className="label-caps" style={{ marginBottom: 14 }}>ESP32 Sensor Nodes</div>
                {devices.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,.3)", fontSize: 13 }}>No sensor data. POST to /api/sensor/ingest</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col = statusColor(d);
                      return (
                        <div key={d.id} onClick={() => { setSelectedId(d.id); setShowSheet(true); }} style={{ padding: 14, borderRadius: 14, cursor: "pointer", background: `${col}08`, border: `1px solid ${col}30` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${col}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {d.online ? <Wifi size={15} color={col} /> : <WifiOff size={15} color="#666" />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{d.location}</div>
                            </div>
                            <div style={{ display: "flex", gap: 5 }}>
                              {d.fireDetected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,.2)", color: "#FF4D4D", fontWeight: 700 }}>FIRE</span>}
                              {d.smokeAlert   && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,.2)", color: "#FF8C42", fontWeight: 700 }}>CO2</span>}
                              {d.isRaining    && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(96,165,250,.2)", color: "#60A5FA", fontWeight: 700 }}>RAIN</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
                            <span style={{ color: "#FF8C42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                            <span style={{ color: "#60A5FA" }}>{d.humidity.toFixed(0)}%</span>
                            <span style={{ color: co2Color(d.co2) }}>CO₂ {d.co2}ppm</span>
                            <span style={{ color: soilColor(d.soilMoisture) }}>Soil {d.soilMoisture.toFixed(0)}%</span>
                            <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}><Battery size={10} />{d.battery}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mobile bottom sheet */}
              {showSheet && selectedDev && (
                <>
                  <div onClick={() => setShowSheet(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 60, backdropFilter: "blur(4px)" }} />
                  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "rgba(8,22,18,.98)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto", border: "1px solid rgba(255,255,255,.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div><div style={{ fontSize: 17, fontWeight: 900 }}>{selectedDev.name}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,.4)" }}>{selectedDev.location}</div></div>
                      <button onClick={() => setShowSheet(false)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}><X size={18} /></button>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.07)", borderBottom: "1px solid rgba(255,255,255,.07)", marginBottom: 16 }}>
                      <MiniGauge value={selectedDev.temperature}  max={60}   color="#FF8C42"                          label="Temp" unit="°C" />
                      <MiniGauge value={selectedDev.humidity}     max={100}  color="#60A5FA"                          label="Hum"  unit="%" />
                      <MiniGauge value={selectedDev.co2}          max={1000} color={co2Color(selectedDev.co2)}        label="CO₂"  unit="ppm" />
                      <MiniGauge value={selectedDev.soilMoisture} max={100}  color={soilColor(selectedDev.soilMoisture)} label="Soil" unit="%" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {statusRows(selectedDev).map(st => (
                        <div key={st.label} style={{ padding: "12px 14px", borderRadius: 12, background: st.active ? `${st.color}12` : "rgba(157,200,141,.07)", border: `1px solid ${st.active ? st.color + "35" : "rgba(157,200,141,.2)"}`, display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ color: st.active ? st.color : "#9DC88D" }}>{st.icon}</div>
                          <div>
                            <div className="label-caps" style={{ fontSize: 9, marginBottom: 2 }}>{st.label}</div>
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
            /* Desktop: side-by-side list + detail panel */
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 20 }}>
              {/* Device list */}
              <div style={card()}>
                <div className="label-caps" style={{ marginBottom: 14 }}>ESP32 Sensor Nodes</div>
                {devices.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,.3)", fontSize: 13 }}>No sensor data.<br /><span style={{ fontSize: 11, opacity: 0.7 }}>POST to /api/sensor/ingest</span></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col    = statusColor(d);
                      const active = d.id === selectedId || (!selectedId && d === devices[0]);
                      return (
                        <div key={d.id} onClick={() => setSelectedId(d.id)} style={{ padding: "14px 16px", borderRadius: 14, cursor: "pointer", background: active ? `${col}12` : "rgba(255,255,255,.03)", border: `1px solid ${active ? col + "40" : "rgba(255,255,255,.07)"}`, display: "flex", alignItems: "center", gap: 14 }}>
                          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {d.online ? <Wifi size={17} color={col} /> : <WifiOff size={17} color="#666" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.name}</div>
                              <div style={{ display: "flex", gap: 5 }}>
                                {d.fireDetected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,.2)", color: "#FF4D4D", fontWeight: 700 }}>FIRE</span>}
                                {d.smokeAlert   && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,.2)", color: "#FF8C42", fontWeight: 700 }}>CO2↑</span>}
                                {d.isRaining    && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(96,165,250,.2)", color: "#60A5FA", fontWeight: 700 }}>RAIN</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>{d.location}</div>
                            <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12, flexWrap: "wrap" }}>
                              <span style={{ color: "#FF8C42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                              <span style={{ color: "#60A5FA" }}>{d.humidity.toFixed(0)}%</span>
                              <span style={{ color: co2Color(d.co2) }}>CO₂ {d.co2}ppm</span>
                              <span style={{ color: soilColor(d.soilMoisture) }}>Soil {d.soilMoisture.toFixed(0)}%</span>
                              <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}><Battery size={10} />{d.battery}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Device detail */}
              {selectedDev ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ ...card(), border: `1px solid ${statusColor(selectedDev)}35` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900 }}>{selectedDev.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}><MapPin size={10} /> {selectedDev.location}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                        <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "rgba(157,200,141,.15)", color: "#9DC88D", border: "1px solid rgba(157,200,141,.3)" }}>● Online</span>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", display: "flex", alignItems: "center", gap: 4 }}><Clock size={10} /> {new Date(selectedDev.lastSeen).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,.07)", borderBottom: "1px solid rgba(255,255,255,.07)", marginBottom: 16 }}>
                      <MiniGauge value={selectedDev.temperature}  max={60}   color="#FF8C42"                              label="Temp"  unit="°C" />
                      <MiniGauge value={selectedDev.humidity}     max={100}  color="#60A5FA"                              label="Hum"   unit="%" />
                      <MiniGauge value={selectedDev.co2}          max={1000} color={co2Color(selectedDev.co2)}            label="CO₂"   unit="ppm" />
                      <MiniGauge value={selectedDev.soilMoisture} max={100}  color={soilColor(selectedDev.soilMoisture)}  label="Soil"  unit="%" />
                      <MiniGauge value={1023 - selectedDev.rainValue} max={1023} color="#60A5FA"                          label="Rain"  unit="wet" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {[
                        { label: "Temperature",    val: `${selectedDev.temperature.toFixed(1)}°C`, color: "#FF8C42", icon: <Thermometer size={12} /> },
                        { label: "Humidity",       val: `${selectedDev.humidity.toFixed(0)}%`,     color: "#60A5FA", icon: <Droplets   size={12} /> },
                        { label: "Heat Index",     val: `${selectedDev.heatIndex.toFixed(1)}°C`,   color: "#F1B24A", icon: <Thermometer size={12} /> },
                        { label: "CO₂ (MQ-135)",  val: `${selectedDev.co2} ppm`,                  color: co2Color(selectedDev.co2), icon: <Radio size={12} /> },
                        { label: "Rain (YL-83)",   val: `${rainLabel(selectedDev.rainValue)} (${selectedDev.rainValue})`, color: "#60A5FA", icon: <CloudRain size={12} /> },
                        { label: "Soil Moisture",  val: `${soilLabel(selectedDev.soilMoisture)} ${selectedDev.soilMoisture.toFixed(0)}%`, color: soilColor(selectedDev.soilMoisture), icon: <Leaf size={12} /> },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${s.color}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: s.color }}>{s.icon}<span style={{ fontSize: 9, color: "rgba(255,255,255,.4)", textTransform: "uppercase" }}>{s.label}</span></div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ ...card(), padding: "16px 18px" }}>
                    <div className="label-caps" style={{ marginBottom: 12 }}>Detection Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {statusRows(selectedDev).map(st => (
                        <div key={st.label} style={{ padding: "11px 14px", borderRadius: 12, background: st.active ? `${st.color}12` : "rgba(157,200,141,.07)", border: `1px solid ${st.active ? st.color + "35" : "rgba(157,200,141,.2)"}`, display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ color: st.active ? st.color : "#9DC88D" }}>{st.icon}</div>
                          <div>
                            <div className="label-caps" style={{ fontSize: 9, marginBottom: 2 }}>{st.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: st.active ? st.color : "#9DC88D" }}>{st.msg}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ ...card(), display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                  <Wifi size={32} color="rgba(255,255,255,.15)" />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,.3)" }}>Select a device to view details</div>
                </div>
              )}
            </div>
          )}

          {/* Raw readings table */}
          {readings.length > 0 && (
            <div style={card()}>
              <div className="label-caps" style={{ marginBottom: 14 }}>Recent Sensor Readings (ESP32 → API)</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      {["Time","Device","Sensor","Value","Temp","Humidity","CO₂","Rain","Soil","Fire"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 10, color: "rgba(255,255,255,.38)", fontWeight: 600, background: "rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 15).map((r, i) => {
                      const fc = r.fire_detected ? "#FF4D4D" : (r.smoke_ppm ?? 0) > 150 ? "#FF8C42" : "#9DC88D";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,.5)" }}>{new Date(r.recorded_at).toLocaleTimeString()}</td>
                          <td style={{ padding: "9px 10px", fontSize: 11, fontWeight: 600 }}>{r.device_id}</td>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "#F1B24A" }}>{r.sensor_type}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700 }}>{r.value} {r.unit ?? ""}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#FF8C42" }}>{r.temperature != null ? `${r.temperature.toFixed(1)}°` : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#60A5FA" }}>{r.humidity     != null ? `${r.humidity.toFixed(0)}%`     : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: co2Color(r.co2_ppm ?? 0) }}>{r.co2_ppm != null ? r.co2_ppm : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#60A5FA" }}>{r.rain_value != null ? rainLabel(r.rain_value) : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: soilColor(r.soil_moisture ?? 50) }}>{r.soil_moisture != null ? `${r.soil_moisture.toFixed(0)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px" }}><span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${fc}18`, color: fc, border: `1px solid ${fc}30` }}>{r.fire_detected ? "🔥 YES" : "CLEAR"}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Demo mode notice */}
          {devices.length > 0 && devices[0].id.startsWith("DEMO") && (
            <div style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.25)", fontSize: 13, color: "rgba(255,255,255,.7)" }}>
              <div style={{ fontWeight: 700, color: "#60A5FA", marginBottom: 10 }}>ℹ Demo Mode — Connect your ESP32</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", lineHeight: 1.8 }}>
                Send sensor data to: <code style={{ background: "rgba(255,255,255,.08)", padding: "2px 8px", borderRadius: 4, color: "#9DC88D" }}>POST http://&lt;YOUR-IP&gt;/api/sensor/ingest</code>
              </div>
              <pre style={{ background: "rgba(0,0,0,.3)", borderRadius: 10, padding: "12px 14px", fontSize: 11, color: "#9DC88D", marginTop: 10, overflowX: "auto" }}>{`{
  "device_id": "ESP32-001",
  "seq": 1,
  "measured_at": "2026-04-05T10:30:00",
  "readings": [
    { "sensor_id":"S1","sensor_type":"temperature","value":34.5,"unit":"C" },
    { "sensor_id":"S2","sensor_type":"humidity",   "value":42.0,"unit":"%" },
    { "sensor_id":"S3","sensor_type":"co2",        "value":450, "unit":"ppm" },
    { "sensor_id":"S4","sensor_type":"rain",       "value":800, "unit":"raw" },
    { "sensor_id":"S5","sensor_type":"soil",       "value":65,  "unit":"%" }
  ]
}`}</pre>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}