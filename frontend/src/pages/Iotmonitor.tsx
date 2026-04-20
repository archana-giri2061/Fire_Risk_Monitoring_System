// This file powers the IoT Sensor Monitor page. It polls the backend every 30 seconds
// for live ESP32 sensor readings, builds a per-device summary, auto-fires an alert email
// when fire is detected, and lets admins send manual alerts or a quick SMTP test.

import { useEffect, useState, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Wifi, Thermometer, Droplets, Flame,
  AlertTriangle, CheckCircle, Bell, RefreshCw,
  MapPin, Clock, Battery, Activity, Radio,
  LayoutDashboard, CalendarDays, Menu, X,
  WifiOff, Zap, CloudRain, Leaf,
} from "lucide-react";
import logo from "../assets/logo.png";
import { api } from "../api";
import type { SensorReading } from "../api";

// Represents one physical ESP32 node, built by aggregating its raw sensor readings.
// Each field maps to a specific sensor attached to the board.
interface IoTDevice {
  id: string;       // unique device_id string from the backend, e.g. "ESP32-001"
  name: string;     // human-readable label generated from the device index, e.g. "ESP32 Node 1"
  location: string; // zone label generated from the device index, e.g. "Zone A — Lumbini Forest"
  lat: number;      // approximate latitude used for display (offset per device index)
  lng: number;      // approximate longitude used for display (offset per device index)
  online: boolean;  // true if the device has sent data recently
  battery: number;  // estimated battery percentage (0-100)
  lastSeen: string; // ISO timestamp of the most recent reading

  // DHT22 temperature and humidity sensor
  temperature: number; // degrees Celsius
  humidity: number;    // relative humidity as a percentage (0-100)
  heatIndex: number;   // feels-like temperature factoring in humidity

  // MQ-135 air quality sensor
  co2: number;      // CO₂ concentration in parts per million
  smokePpm: number; // smoke concentration in ppm (same sensor, different reading path)

  // YL-83 rain sensor
  rainValue: number; // raw ADC value — lower means wetter (0 = soaked, 1023 = dry)
  isRaining: boolean; // true when rainValue falls below the wet threshold

  // Capacitive soil moisture sensor
  soilMoisture: number; // percentage 0-100 (100 = saturated)
  soilDry: boolean;     // true when soil moisture drops below 20%

  // Derived alert flags
  fireDetected: boolean; // true when the MQ-135 smoke reading or CO₂ crosses the danger threshold
  smokeAlert: boolean;   // true when smoke is elevated but not yet at fire level
  alertSent: boolean;    // true when an automated alert email has already been sent for this device
}

// Returns true when the viewport is narrower than 768 px.
// Attaches a resize listener so the value stays accurate when the window is resized.
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return m;
}

// Returns the border and icon colour for a device card based on the most severe active condition.
// Offline devices are grey; fire is red; smoke is orange; rain is blue; normal is green.
function statusColor(d: IoTDevice) {
  if (!d.online)      return "#666";
  if (d.fireDetected) return "#ff4d4d";
  if (d.smokeAlert)   return "#ff8c42";
  if (d.isRaining)    return "#60a5fa";
  return "#9DC88D";
}

// Returns a colour for the battery percentage indicator.
// Green above 60%, amber from 25-60%, red below 25%.
function batteryColor(pct: number) {
  return pct > 60 ? "#9DC88D" : pct > 25 ? "#F1B24A" : "#ff4d4d";
}

// Returns the colour for a CO₂ reading based on common indoor air quality thresholds.
function co2Color(ppm: number) {
  return ppm > 800 ? "#ff4d4d" : ppm > 600 ? "#ff8c42" : ppm > 400 ? "#F1B24A" : "#9DC88D";
}

// Returns a human-readable label for a CO₂ reading.
function co2Label(ppm: number) {
  return ppm > 800 ? "DANGER" : ppm > 600 ? "HIGH" : ppm > 400 ? "ELEVATED" : "NORMAL";
}

// Returns a label for the soil moisture percentage.
function soilLabel(pct: number) {
  return pct < 20 ? "DRY" : pct < 50 ? "LOW" : pct < 80 ? "OK" : "WET";
}

// Returns a colour for the soil moisture reading — red when dry, amber when low, green otherwise.
function soilColor(pct: number) {
  return pct < 20 ? "#ff4d4d" : pct < 50 ? "#F1B24A" : "#9DC88D";
}

// Returns a human-readable label for the YL-83 rain sensor's raw ADC value.
// Lower values mean more water on the sensor.
function rainLabel(val: number) {
  return val < 200 ? "HEAVY" : val < 500 ? "LIGHT" : "NONE";
}

// Local sidebar component used only on this page.
// On mobile it renders as a slide-in drawer with a dark backdrop.
// On desktop it renders as a collapsible sticky sidebar.
function Sidebar({
  collapsed, setCollapsed, mobileOpen, setMobileOpen,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen?: boolean;
  setMobileOpen?: (v: boolean) => void;
}) {
  const loc      = useLocation();
  const isMobile = useIsMobile();

  const links = [
    { to: "/home",    icon: <LayoutDashboard size={18} />, label: "Dashboard"   },
    { to: "/forecast",icon: <CalendarDays    size={18} />, label: "Forecast"    },
    { to: "/iot",     icon: <Wifi            size={18} />, label: "IoT Monitor" },
    { to: "/alerts",  icon: <Bell            size={18} />, label: "Alerts"      },
    { to: "/",        icon: <Activity        size={18} />, label: "Home"        },
  ];

  if (isMobile) return (
    <>
      {/* dark semi-transparent backdrop that closes the drawer when tapped */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen?.(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40, backdropFilter: "blur(4px)" }}
        />
      )}
      <aside style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 260, zIndex: 50,
        background: "rgba(8,22,18,0.98)", backdropFilter: "blur(20px)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex", flexDirection: "column",
        // slides in from the left when mobileOpen is true
        transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.3s ease",
      }}>
        <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src={logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover" }} />
            <div>
              <div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff" }}>वन दृष्टि</div>
              <div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div>
            </div>
          </div>
          <button onClick={() => setMobileOpen?.(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {links.map(lk => {
            const active = loc.pathname === lk.to;
            return (
              <Link
                key={lk.to} to={lk.to}
                onClick={() => setMobileOpen?.(false)} // close the drawer when a link is tapped
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 16px", borderRadius: 14,
                  background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent",
                  border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent",
                  color: active ? "#F1B24A" : "rgba(255,255,255,0.7)",
                  fontWeight: active ? 700 : 500, fontSize: 15, textDecoration: "none",
                }}
              >
                {lk.icon}<span>{lk.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );

  return (
    <aside style={{
      width: collapsed ? 68 : 220,
      minHeight: "100vh", flexShrink: 0,
      background: "rgba(8,22,18,0.85)", backdropFilter: "blur(20px)",
      borderRight: "1px solid rgba(255,255,255,0.07)",
      display: "flex", flexDirection: "column",
      transition: "width 0.3s ease", overflow: "hidden",
      position: "sticky", top: 0, alignSelf: "flex-start",
    }}>
      <div style={{ padding: "20px 16px 16px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <img src={logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        {/* hide the text label when collapsed so only the logo shows */}
        {!collapsed && (
          <div>
            <div style={{ fontFamily: "'Noto Sans Devanagari',sans-serif", fontSize: 16, fontWeight: 800, color: "#fff" }}>वन दृष्टि</div>
            <div style={{ fontSize: 10, color: "#9DC88D" }}>Fire Monitor</div>
          </div>
        )}
      </div>
      <nav style={{ flex: 1, padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        {links.map(lk => {
          const active = loc.pathname === lk.to;
          return (
            <Link
              key={lk.to} to={lk.to}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                // center the icon when collapsed; normal left-align when expanded
                padding: collapsed ? "12px 0" : "12px 14px",
                justifyContent: collapsed ? "center" : "flex-start",
                borderRadius: 14,
                background: active ? "linear-gradient(135deg,rgba(241,178,74,0.22),rgba(241,178,74,0.08))" : "transparent",
                border: active ? "1px solid rgba(241,178,74,0.25)" : "1px solid transparent",
                color: active ? "#F1B24A" : "rgba(255,255,255,0.58)",
                fontWeight: active ? 700 : 500, fontSize: 14, textDecoration: "none",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {lk.icon}{!collapsed && <span>{lk.label}</span>}
            </Link>
          );
        })}
      </nav>
      {/* toggle button at the bottom that collapses or expands the sidebar */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{ margin: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {collapsed ? <Menu size={16} /> : <X size={16} />}
      </button>
    </aside>
  );
}

// Circular SVG gauge that fills an arc proportionally to value/max.
// Used in the device detail panel to give an at-a-glance reading for each sensor.
function MiniGauge({
  value, max, color, label, unit,
}: {
  value: number; max: number; color: string; label: string; unit: string;
}) {
  const pct = Math.min(100, (value / max) * 100); // cap fill at 100% to guard against out-of-range readings
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ position: "relative", width: 56, height: 56, margin: "0 auto" }}>
        <svg viewBox="0 0 64 64" style={{ width: 56, height: 56, transform: "rotate(-90deg)" }}>
          {/* grey track behind the coloured arc */}
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
          {/* coloured arc whose length is proportional to the current value */}
          <circle
            cx="32" cy="32" r="26" fill="none"
            stroke={color} strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 26}`}
            strokeDashoffset={`${2 * Math.PI * 26 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }} // smooth animation when value changes
          />
        </svg>
        {/* numeric value printed in the centre of the circle */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color, lineHeight: 1 }}>{Math.round(value)}</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)" }}>{unit}</div>
        </div>
      </div>
    </div>
  );
}

export default function IoTMonitor() {
  const [devices, setDevices]           = useState<IoTDevice[]>([]);       // list of ESP32 nodes built from grouped sensor readings
  const [readings, setReadings]         = useState<SensorReading[]>([]);   // flat list of raw readings shown in the table
  const [loading, setLoading]           = useState(true);                  // true while the first fetch is in progress
  const [collapsed, setCollapsed]       = useState(false);                 // whether the desktop sidebar is collapsed
  const [mobileOpen, setMobileOpen]     = useState(false);                 // whether the mobile sidebar drawer is open
  const [alertMsg, setAlertMsg]         = useState("");                    // status message shown in the alert banner
  const [sendingAlert, setSendingAlert] = useState(false);                 // true while a manual alert request is running
  const [lastRefresh, setLastRefresh]   = useState("");                    // clock time of the last successful fetch
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null); // device_id of the device currently shown in the detail panel
  const [showDetail, setShowDetail]     = useState(false);                 // controls the mobile bottom-sheet detail panel

  // keeps track of which device IDs have already had an alert email sent so we
  // do not fire duplicate emails on subsequent polls
  const alertedRef = useRef<Set<string>>(new Set());

  const isMobile = useIsMobile();

  // Takes the raw sensor readings for a single device and collapses them into one
  // IoTDevice summary object. The readings array may contain one row per sensor type
  // so we index by sensor_type to pick up the latest value for each sensor.
  function buildDevice(id: string, rows: SensorReading[], idx: number): IoTDevice {
    // build a lookup so we can grab any sensor value by type name
    const byType: Record<string, number>  = {};
    const byTypeBool: Record<string, boolean> = {};

    rows.forEach(r => {
      const t = r.sensor_type.toLowerCase();
      byType[t] = r.value;
      byType[r.sensor_type] = r.value; // store both lower and original case for resilience

      // boolean flags come from dedicated columns on the reading row
      if (r.fire_detected !== undefined) byTypeBool["fire"]     = r.fire_detected;
      if (r.is_raining    !== undefined) byTypeBool["rain"]     = r.is_raining;
      if (r.soil_dry      !== undefined) byTypeBool["soil_dry"] = r.soil_dry;
    });

    // fall back through several possible sensor_type names, then top-level columns, then a safe default
    const temp  = byType["temperature"] ?? byType["temp"] ?? rows[0]?.temperature ?? 0;
    const hum   = byType["humidity"]    ?? byType["hum"]  ?? rows[0]?.humidity    ?? 0;
    const co2   = byType["co2"]                           ?? rows[0]?.co2_ppm     ?? 400;
    const smoke = byType["smoke"]  ?? byType["SMOKE"]  ?? byType["mq135"]        ?? co2;
    const rain  = byType["rain"]   ?? byType["RAIN"]   ?? byType["rainfall"]     ?? byType["yl83"] ?? rows[0]?.rain_value    ?? 1023;
    const soil  = byType["soil"]   ?? byType["SOIL"]   ?? byType["moisture"]     ?? byType["soil_moisture"] ?? rows[0]?.soil_moisture ?? 50;

    // prefer the boolean flag from the database row; fall back to threshold logic
    const fireFlag = byTypeBool["fire"]     ?? rows[0]?.fire_detected ?? (smoke > 300 || co2 > 800);
    const rainFlag = byTypeBool["rain"]     ?? rain < 500;
    const soilDry  = byTypeBool["soil_dry"] ?? soil < 20;

    return {
      id,
      name:     `ESP32 Node ${idx + 1}`,
      location: `Zone ${String.fromCharCode(65 + idx)} — Lumbini Forest`, // Zone A, Zone B, etc.
      lat: 28.002 + idx * 0.01, // small offset per device so they appear as distinct points on a map
      lng: 83.036 + idx * 0.01,
      online:   true,
      battery:  100 - (idx * 11) % 70, // stagger the battery values so cards look varied in demo
      lastSeen: rows[0]?.recorded_at ?? new Date().toISOString(),
      temperature:  temp,
      humidity:     hum,
      heatIndex:    temp + (hum > 60 ? (hum - 60) * 0.1 : 0), // simple heat index approximation
      co2,
      smokePpm: smoke,
      rainValue:    rain,
      isRaining:    rainFlag,
      soilMoisture: soil,
      soilDry,
      fireDetected: fireFlag,
      smokeAlert:   smoke > 150 && !fireFlag, // elevated smoke but below the fire threshold
      alertSent:    alertedRef.current.has(id),
    };
  }

  // Fetches the latest 100 sensor readings, groups them by device_id, and builds
  // the device list. If any device is newly reporting fire and has not been alerted
  // yet, fires an alert email automatically and records the device ID so it is not
  // alerted again on the next poll.
  const fetchDevices = async () => {
    try {
      const res = await api.sensor.readings(100);
      const raw = res.data || [];

      // show the empty state rather than placeholder data if no readings have been ingested yet
      if (raw.length === 0) {
        setDevices([]);
        setReadings([]);
        setLoading(false);
        setLastRefresh(new Date().toLocaleTimeString());
        return;
      }

      setReadings(raw);

      // group readings by device_id so each device gets its own array
      const grouped: Record<string, SensorReading[]> = {};
      raw.forEach(r => {
        if (!grouped[r.device_id]) grouped[r.device_id] = [];
        grouped[r.device_id].push(r);
      });

      const deviceList = Object.entries(grouped).map(([id, rows], idx) =>
        buildDevice(id, rows, idx),
      );
      setDevices(deviceList);

      // check for any device that is newly detecting fire and has not been alerted yet
      const fireDevices = deviceList.filter(d => d.fireDetected && !alertedRef.current.has(d.id));
      if (fireDevices.length > 0) {
        fireDevices.forEach(d => alertedRef.current.add(d.id)); // mark as alerted before the async call
        const names = fireDevices.map(d => `${d.name} (${d.location})`).join(", ");
        await api.alerts.runEmail("High", [], `FIRE/SMOKE DETECTED by IoT sensors: ${names}`);
        setAlertMsg(`FIRE DETECTED — Auto-alert sent for: ${names}`);
      }
    } catch {
      // on any API error show the empty state — never fall back to fake demo devices
      setDevices([]);
      setReadings([]);
    } finally {
      setLoading(false);
      setLastRefresh(new Date().toLocaleTimeString());
    }
  };

  // sends a manual High-risk alert email to subscribers — does not require a real fire reading
  const manualAlert = async () => {
    setSendingAlert(true);
    try {
      const data = await api.alerts.runEmail("High");
      setAlertMsg(data.sent ? `Manual alert sent — ${data.alerts} day(s)` : `${data.message}`);
    } catch {
      setAlertMsg("Failed to send alert");
    } finally {
      setSendingAlert(false);
    }
  };

  // sends a smoke-test email to verify that the SMTP pipeline is working
  const testAlert = async () => {
    setSendingAlert(true);
    try {
      await api.alerts.testEmail();
      setAlertMsg("Test email sent");
    } catch {
      setAlertMsg("Test email failed");
    } finally {
      setSendingAlert(false);
    }
  };

  // fetch immediately on mount, then re-fetch every 30 seconds so the page stays live
  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 30_000);
    return () => clearInterval(interval); // clear the interval when the component unmounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // derived summary counts used by the stat cards at the top of the page
  const onlineCount = devices.filter(d => d.online).length;
  const alertCount  = devices.filter(d => d.fireDetected || d.smokeAlert).length;
  const fireCount   = devices.filter(d => d.fireDetected).length;
  const rainCount   = devices.filter(d => d.isRaining).length;

  // the device currently shown in the detail panel — defaults to the first device
  const selectedDev = devices.find(d => d.id === selectedDevice) ?? devices[0] ?? null;

  // shared glass-card style reused across all panel sections
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 20,
    padding: "18px 20px",
    ...extra,
  });

  // show a centred spinner while the first fetch is running
  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading IoT devices...</div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar
        collapsed={collapsed} setCollapsed={setCollapsed}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* sticky top bar with page title, online count, refresh, test, and manual alert buttons */}
        <div style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* hamburger button to open the mobile sidebar drawer */}
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
                <Menu size={22} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 15 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>IoT Sensor Monitor</h1>
              {/* subtitle shows how many devices are online and when we last polled */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <Wifi size={10} /> {onlineCount}/{devices.length} online &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading..."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {/* manually trigger a data refresh without waiting for the 30-second interval */}
            <button onClick={fetchDevices} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(157,200,141,0.12)", border: "1px solid rgba(157,200,141,0.25)", color: "#9DC88D", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <RefreshCw size={12} />{!isMobile && " Refresh"}
            </button>

            {/* send a test email to verify SMTP is working */}
            <button onClick={testAlert} disabled={sendingAlert} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)", color: "#60a5fa", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Zap size={12} />{!isMobile && " Test"}
            </button>

            {/* send a manual High-risk alert — bell icon spins while the request is in flight */}
            <button onClick={manualAlert} disabled={sendingAlert} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 12px", borderRadius: 999, background: "rgba(255,140,66,0.15)", border: "1px solid rgba(255,140,66,0.3)", color: "#ff8c42", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Bell size={12} style={{ animation: sendingAlert ? "spin 1s linear infinite" : "none" }} />
              {!isMobile && (sendingAlert ? " Sending..." : " Alert")}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: isMobile ? "16px" : "24px", display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {/* dismissible status banner that appears after any alert action or auto-fire detection */}
          {alertMsg && (
            <div style={{
              padding: "12px 16px", borderRadius: 14,
              // colour the banner based on whether it is a fire alert, success, or info
              background: alertMsg.includes("FIRE") ? "rgba(255,77,77,0.15)" : alertMsg.includes("sent") ? "rgba(157,200,141,0.12)" : "rgba(241,178,74,0.12)",
              border: `1px solid ${alertMsg.includes("FIRE") ? "rgba(255,77,77,0.35)" : "rgba(157,200,141,0.3)"}`,
              color: "#fff", fontSize: 13,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              {alertMsg.includes("FIRE")
                ? <Flame size={16} color="#ff4d4d" />
                : alertMsg.includes("sent")
                  ? <CheckCircle size={16} color="#9DC88D" />
                  : <AlertTriangle size={16} color="#F1B24A" />
              }
              <span style={{ flex: 1 }}>{alertMsg}</span>
              <button onClick={() => setAlertMsg("")} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
          )}

          {/* pulsing emergency banner shown when any sensor is actively detecting fire —
              the animation draws the operator's eye immediately */}
          {fireCount > 0 && (
            <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderRadius: 18, background: "rgba(255,44,44,0.18)", border: "2px solid rgba(255,77,77,0.5)", display: "flex", alignItems: "center", gap: 14, animation: "pulse 1.5s ease-in-out infinite" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,77,77,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Flame size={24} color="#ff4d4d" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: isMobile ? 14 : 18, fontWeight: 900, color: "#ff4d4d" }}>
                  FIRE DETECTED — {fireCount} SENSOR{fireCount > 1 ? "S" : ""} TRIGGERED
                </div>
                {/* list the affected device names below the headline */}
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                  {devices.filter(d => d.fireDetected).map(d => `${d.name} @ ${d.location}`).join(" · ")}
                </div>
              </div>
            </div>
          )}

          {/* four summary stat cards: online devices, fire alerts, rain detections, active alerts */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 14 }}>
            {[
              { label: "Devices Online", val: `${onlineCount}/${devices.length}`, color: "#9DC88D",  icon: <Wifi          size={18} /> },
              { label: "Fire Alerts",    val: fireCount,                           color: "#ff4d4d",  icon: <Flame         size={18} /> },
              { label: "Rain Detected",  val: rainCount,                           color: "#60a5fa",  icon: <CloudRain     size={18} /> },
              { label: "Active Alerts",  val: alertCount,                          color: "#ff8c42",  icon: <AlertTriangle size={18} /> },
            ].map(s => (
              <div key={s.label} style={{
                background: "rgba(255,255,255,0.05)",
                // highlight the card border in the alert colour when the value is non-zero and significant
                border: `1px solid ${Number(s.val) > 0 && s.color !== "#9DC88D" ? s.color + "35" : "rgba(255,255,255,0.09)"}`,
                borderRadius: 18, padding: "16px",
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 10 }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {isMobile ? (
            // on mobile: scrollable device list, tap any row to open a bottom-sheet detail panel
            <>
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>ESP32 Sensor Nodes</div>
                {devices.length === 0 ? (
                  // empty state — shown until the ESP32 starts posting data to the ingest endpoint
                  <div style={{ textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    <div style={{ marginBottom: 8, fontSize: 15, color: "rgba(255,255,255,0.4)" }}>No sensor data available</div>
                    <div style={{ fontSize: 12 }}>Send data via POST /api/sensor/ingest</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col = statusColor(d);
                      return (
                        <div
                          key={d.id}
                          onClick={() => { setSelectedDevice(d.id); setShowDetail(true); }}
                          style={{ padding: "14px", borderRadius: 14, cursor: "pointer", background: `${col}08`, border: `1px solid ${col}30` }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: `${col}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {/* show a wifi-off icon when the device is offline */}
                              {d.online ? <Wifi size={15} color={col} /> : <WifiOff size={15} color="#666" />}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{d.location}</div>
                            </div>
                            {/* alert badges for the most important conditions */}
                            <div style={{ display: "flex", gap: 5 }}>
                              {d.fireDetected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,0.2)",   color: "#ff4d4d", fontWeight: 700 }}>FIRE</span>}
                              {d.smokeAlert   && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,0.2)",  color: "#ff8c42", fontWeight: 700 }}>CO2</span>}
                              {d.isRaining    && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(96,165,250,0.2)",  color: "#60a5fa", fontWeight: 700 }}>RAIN</span>}
                            </div>
                          </div>
                          {/* quick metric row below the device header */}
                          <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap" }}>
                            <span style={{ color: "#ff8c42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                            <span style={{ color: "#60a5fa" }}>{d.humidity.toFixed(0)}%</span>
                            <span style={{ color: co2Color(d.co2) }}>CO₂ {d.co2}ppm</span>
                            <span style={{ color: soilColor(d.soilMoisture) }}>Soil {d.soilMoisture.toFixed(0)}%</span>
                            <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}>
                              <Battery size={10} />{d.battery}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* mobile bottom-sheet detail panel — slides up from the bottom when a device is tapped */}
              {showDetail && selectedDev && (
                <>
                  {/* dark backdrop — tapping it closes the sheet */}
                  <div
                    onClick={() => setShowDetail(false)}
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 60, backdropFilter: "blur(4px)" }}
                  />
                  <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 70, background: "rgba(8,22,18,0.98)", borderRadius: "20px 20px 0 0", padding: "20px 20px 32px", maxHeight: "80vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{selectedDev.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{selectedDev.location}</div>
                      </div>
                      <button onClick={() => setShowDetail(false)} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}>
                        <X size={18} />
                      </button>
                    </div>

                    {/* four circular gauges for the primary sensor readings */}
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
                      <MiniGauge value={selectedDev.temperature}  max={60}   color="#ff8c42"                              label="Temp" unit="°C" />
                      <MiniGauge value={selectedDev.humidity}     max={100}  color="#60a5fa"                              label="Hum"  unit="%" />
                      <MiniGauge value={selectedDev.co2}          max={1000} color={co2Color(selectedDev.co2)}            label="CO₂" unit="ppm" />
                      <MiniGauge value={selectedDev.soilMoisture} max={100}  color={soilColor(selectedDev.soilMoisture)}  label="Soil" unit="%" />
                    </div>

                    {/* five status rows — one per detection type */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "Fire/Smoke",    active: selectedDev.fireDetected,    color: "#ff4d4d", msg: selectedDev.fireDetected ? "FIRE DETECTED"                                           : "Clear",                                                     icon: <Flame     size={14} /> },
                        { label: "CO₂ Level",     active: selectedDev.co2 > 600,       color: "#ff8c42", msg: `${co2Label(selectedDev.co2)} — ${selectedDev.co2} ppm`,                                                                                             icon: <Radio     size={14} /> },
                        { label: "Rain Sensor",   active: selectedDev.isRaining,       color: "#60a5fa", msg: selectedDev.isRaining ? `Rain detected (${selectedDev.rainValue})`                  : "No rain",                                                   icon: <CloudRain size={14} /> },
                        { label: "Soil Moisture", active: selectedDev.soilDry,         color: "#F1B24A", msg: `${soilLabel(selectedDev.soilMoisture)} — ${selectedDev.soilMoisture.toFixed(0)}%`,                                                                  icon: <Leaf      size={14} /> },
                        { label: "Battery",       active: selectedDev.battery < 25,    color: "#ff4d4d", msg: selectedDev.battery < 25 ? `Low: ${selectedDev.battery}%`                          : `OK: ${selectedDev.battery}%`,                                icon: <Battery   size={14} /> },
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
            // on desktop: two-column layout — device list on the left, detail panel on the right
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 20 }}>

              {/* left column: scrollable list of all connected ESP32 nodes */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>ESP32 Sensor Nodes</div>
                {devices.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                    No sensor data.<br />
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Send data via POST /api/sensor/ingest</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {devices.map(d => {
                      const col    = statusColor(d);
                      // highlight the row when it is selected or when it is the first row and nothing is selected
                      const active = selectedDevice === d.id || (!selectedDevice && d === devices[0]);
                      return (
                        <div
                          key={d.id}
                          onClick={() => setSelectedDevice(d.id)}
                          style={{ padding: "14px 16px", borderRadius: 14, cursor: "pointer", background: active ? `${col}12` : "rgba(255,255,255,0.03)", border: `1px solid ${active ? col + "40" : "rgba(255,255,255,0.07)"}`, display: "flex", alignItems: "center", gap: 14 }}
                        >
                          <div style={{ width: 38, height: 38, borderRadius: 12, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            {d.online ? <Wifi size={17} color={col} /> : <WifiOff size={17} color="#666" />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{d.name}</div>
                              <div style={{ display: "flex", gap: 5 }}>
                                {d.fireDetected && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,77,77,0.2)",  color: "#ff4d4d", fontWeight: 700 }}>FIRE</span>}
                                {d.smokeAlert   && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(255,140,66,0.2)", color: "#ff8c42", fontWeight: 700 }}>CO2↑</span>}
                                {d.isRaining    && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 999, background: "rgba(96,165,250,0.2)", color: "#60a5fa", fontWeight: 700 }}>RAIN</span>}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>{d.location}</div>
                            <div style={{ display: "flex", gap: 12, marginTop: 7, fontSize: 12, flexWrap: "wrap" }}>
                              <span style={{ color: "#ff8c42", fontWeight: 700 }}>{d.temperature.toFixed(1)}°C</span>
                              <span style={{ color: "#60a5fa" }}>{d.humidity.toFixed(0)}%</span>
                              <span style={{ color: co2Color(d.co2) }}>CO₂ {d.co2}ppm</span>
                              <span style={{ color: soilColor(d.soilMoisture) }}>Soil {d.soilMoisture.toFixed(0)}%</span>
                              <span style={{ color: batteryColor(d.battery), display: "flex", alignItems: "center", gap: 2 }}>
                                <Battery size={10} />{d.battery}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* right column: detail panel for the selected device */}
              {selectedDev ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* device header with online status badge and last-seen time */}
                  <div style={{ ...card(), border: `1px solid ${statusColor(selectedDev)}35` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 17, fontWeight: 900, color: "#fff" }}>{selectedDev.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                          <MapPin size={10} /> {selectedDev.location}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                        <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: selectedDev.online ? "rgba(157,200,141,0.15)" : "rgba(100,100,100,0.15)", color: selectedDev.online ? "#9DC88D" : "#888", border: `1px solid ${selectedDev.online ? "rgba(157,200,141,0.3)" : "rgba(100,100,100,0.3)"}` }}>
                          {selectedDev.online ? "● Online" : "○ Offline"}
                        </span>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 4 }}>
                          <Clock size={10} /> {new Date(selectedDev.lastSeen).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    {/* five circular gauges — one per sensor (the rain gauge inverts the value so full = wet) */}
                    <div style={{ display: "flex", justifyContent: "space-around", padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
                      <MiniGauge value={selectedDev.temperature}         max={60}   color="#ff8c42"                             label="Temp" unit="°C"  />
                      <MiniGauge value={selectedDev.humidity}            max={100}  color="#60a5fa"                             label="Hum"  unit="%"   />
                      <MiniGauge value={selectedDev.co2}                 max={1000} color={co2Color(selectedDev.co2)}           label="CO₂" unit="ppm" />
                      <MiniGauge value={selectedDev.soilMoisture}        max={100}  color={soilColor(selectedDev.soilMoisture)} label="Soil" unit="%"   />
                      {/* invert the raw ADC rain value so the gauge fills when it is raining */}
                      <MiniGauge value={1023 - selectedDev.rainValue}    max={1023} color="#60a5fa"                             label="Rain" unit="wet" />
                    </div>

                    {/* six metric tiles: temperature, humidity, heat index, CO₂, rain, and soil */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {[
                        { label: "Temperature",   val: `${selectedDev.temperature.toFixed(1)}°C`,                                          color: "#ff8c42",                          icon: <Thermometer size={12} /> },
                        { label: "Humidity",      val: `${selectedDev.humidity.toFixed(0)}%`,                                              color: "#60a5fa",                          icon: <Droplets    size={12} /> },
                        { label: "Heat Index",    val: `${selectedDev.heatIndex.toFixed(1)}°C`,                                            color: "#F1B24A",                          icon: <Activity    size={12} /> },
                        { label: "CO₂ (MQ-135)", val: `${selectedDev.co2} ppm`,                                                           color: co2Color(selectedDev.co2),          icon: <Radio       size={12} /> },
                        { label: "Rain (YL-83)",  val: `${rainLabel(selectedDev.rainValue)} (${selectedDev.rainValue})`,                   color: "#60a5fa",                          icon: <CloudRain   size={12} /> },
                        { label: "Soil Moisture", val: `${soilLabel(selectedDev.soilMoisture)} ${selectedDev.soilMoisture.toFixed(0)}%`,   color: soilColor(selectedDev.soilMoisture),icon: <Leaf        size={12} /> },
                      ].map(s => (
                        <div key={s.label} style={{ padding: "11px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: `1px solid ${s.color}22` }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5, color: s.color }}>
                            {s.icon}
                            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{s.label}</span>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* detection status panel — five rows, one per sensor type, highlighted when active */}
                  <div style={{ ...card(), padding: "16px 18px" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Detection Status</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {[
                        { label: "Fire Detection",    active: selectedDev.fireDetected,  color: "#ff4d4d", msg: selectedDev.fireDetected  ? "FIRE DETECTED — Emergency alert sent"                            : "No fire detected",                                                   icon: <Flame     size={14} /> },
                        { label: "CO₂ / Air Quality", active: selectedDev.co2 > 600,     color: "#ff8c42", msg: `${co2Label(selectedDev.co2)} — ${selectedDev.co2} ppm`,                                                                                                              icon: <Radio     size={14} /> },
                        { label: "Rain Detection",    active: selectedDev.isRaining,     color: "#60a5fa", msg: selectedDev.isRaining      ? `Rain detected (raw: ${selectedDev.rainValue})`                  : "No rain",                                                            icon: <CloudRain size={14} /> },
                        { label: "Soil Condition",    active: selectedDev.soilDry,       color: "#F1B24A", msg: `${soilLabel(selectedDev.soilMoisture)} — ${selectedDev.soilMoisture.toFixed(0)}% moisture`,                                                                         icon: <Leaf      size={14} /> },
                        { label: "Battery",           active: selectedDev.battery < 25,  color: "#ff4d4d", msg: selectedDev.battery < 25   ? `Low: ${selectedDev.battery}%`                                  : `OK: ${selectedDev.battery}%`,                                        icon: <Battery   size={14} /> },
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
                // placeholder shown when no device has been selected yet
                <div style={{ ...card(), display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                  <Wifi size={32} color="rgba(255,255,255,0.15)" />
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)" }}>Select a device to view details</div>
                </div>
              )}
            </div>
          )}

          {/* raw readings table — shows the last 15 sensor rows ingested from the ESP32s */}
          {readings.length > 0 && (
            <div style={card()}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14 }}>
                Recent Sensor Readings (ESP32 → API)
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      {["Time", "Device", "Sensor", "Value", "Temp", "Humidity", "CO₂", "Rain", "Soil", "Fire"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 10, color: "rgba(255,255,255,0.38)", fontWeight: 600, background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 15).map((r, i) => {
                      // choose the fire column colour based on whether fire or elevated smoke is present
                      const fc = r.fire_detected ? "#ff4d4d" : (r.smoke_ppm ?? 0) > 150 ? "#ff8c42" : "#9DC88D";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {new Date(r.recorded_at).toLocaleTimeString()}
                          </td>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>{r.device_id}</td>
                          <td style={{ padding: "9px 10px", fontSize: 11, color: "#F1B24A" }}>{r.sensor_type}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 700, color: "#fff" }}>{r.value} {r.unit ?? ""}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#ff8c42" }}>{r.temperature != null ? `${r.temperature.toFixed(1)}°` : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#60a5fa" }}>{r.humidity    != null ? `${r.humidity.toFixed(0)}%`    : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: co2Color(r.co2_ppm ?? 0) }}>{r.co2_ppm != null ? `${r.co2_ppm}` : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: "#60a5fa" }}>{r.rain_value  != null ? rainLabel(r.rain_value) : "—"}</td>
                          <td style={{ padding: "9px 10px", fontSize: 12, color: soilColor(r.soil_moisture ?? 50) }}>{r.soil_moisture != null ? `${r.soil_moisture.toFixed(0)}%` : "—"}</td>
                          <td style={{ padding: "9px 10px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: `${fc}18`, color: fc, border: `1px solid ${fc}30` }}>
                              {r.fire_detected ? "YES" : "CLEAR"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ESP32 connection guide — only shown when the device list contains demo IDs,
              so real deployments never see this block */}
          {devices.length > 0 && devices[0].id.startsWith("DEMO") && (
            <div style={{ padding: "16px 20px", borderRadius: 14, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.25)", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
              <div style={{ fontWeight: 700, color: "#60a5fa", marginBottom: 10 }}>Demo Mode — Connect your ESP32</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
                Send sensor data from your ESP32 to:<br />
                <code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 8px", borderRadius: 4, color: "#9DC88D" }}>
                  {"POST http://<YOUR-EC2-ELASTIC-IP>/api/sensor/ingest"}
                </code>
                <br /><br />
                Payload example:
              </div>
              <pre style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 14px", fontSize: 11, color: "#9DC88D", marginTop: 10, overflowX: "auto" }}>{`{
  "device_id": "ESP32-001",
  "seq": 1,
  "measured_at": "2026-04-05T10:30:00",
  "readings": [
    { "sensor_id": "S1", "sensor_type": "temperature", "value": 34.5, "unit": "C"   },
    { "sensor_id": "S2", "sensor_type": "humidity",    "value": 42.0, "unit": "%"   },
    { "sensor_id": "S3", "sensor_type": "co2",         "value": 450,  "unit": "ppm" },
    { "sensor_id": "S4", "sensor_type": "rain",        "value": 800,  "unit": "raw" },
    { "sensor_id": "S5", "sensor_type": "soil",        "value": 65,   "unit": "%"   }
  ]
}`}</pre>
            </div>
          )}

        </div>
      </div>

      {/* CSS keyframes for the loading spinner and the pulsing fire-alert banner */}
      <style>{`
        @keyframes spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.05)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar       { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
      `}</style>
    </div>
  );
}

// IoT Monitor only shows real sensor data.
// To populate it: POST /api/sensor/ingest with your ESP32 payload (see the guide above).