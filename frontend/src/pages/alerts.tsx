// This file powers the Alert Center page. It handles fetching alert history,
// showing the 7-day fire-risk forecast, sending email alerts, playing sounds,
// and logging everything in a history list the user can expand.

import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Bell, BellOff, BellRing, CheckCircle, AlertTriangle,
  RefreshCw, Send, Mail, Flame, Clock, MapPin,
  Menu, Zap, Shield, ChevronDown, ChevronUp,
  Volume2, VolumeX,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import { useIsMobile } from "../hooks/useIsMobile";
import { RISK_COLOR, RISK_BG, RISK_ICON } from "../utils/risk";
import { api, setAdminKey, getAdminKey, clearAdminKey } from "../api";
import AdminLogin from "./AdminLogin";

// Represents one record in the alert history table returned by the backend.
// Each time an alert email is sent, a row like this gets created.
interface AlertLog {
  id: number;           // auto-incremented database ID for this alert
  location_key: string; // slug identifying which location was alerted, e.g. "lumbini_np"
  risk_label: string;   // the risk tier that triggered this alert: Low, Moderate, High, or Extreme
  alert_date: string;   // the forecast date this alert was about, formatted as YYYY-MM-DD
  message: string;      // the short summary line that was included in the email body
  created_at: string;   // full ISO timestamp of when this record was saved to the database
}

// Represents one day in the ML model's 7-day fire-risk forecast.
interface Prediction {
  date: string;             // the calendar date being predicted, formatted as YYYY-MM-DD
  risk_label: string;       // what risk tier the model predicts: Low, Moderate, High, or Extreme
  risk_probability: number; // the model's confidence as a decimal between 0 and 1
}

// A short-lived notification that pops up in the top-right corner of the screen
// and disappears automatically after a few seconds.
interface Toast {
  id: number;                         // incrementing number used to find and remove this toast later
  msg: string;                        // the text the user sees
  type: "success" | "error" | "info"; // determines the color and icon shown alongside the message
}

// Tries to create a Web Audio context so we can play synthesized alert sounds.
// Returns null if the browser does not support the Web Audio API at all.
function createAudioCtx(): AudioContext | null {
  try {
    return new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
}

// Plays a single synthesized beep through the browser's audio output.
// The oscillator generates the raw wave, the gain node shapes its volume,
// and we fade to near-silence at the end to avoid an abrupt click.
//
// ctx   — the active audio context to schedule the tone through
// freq  — pitch in Hz, e.g. 440 is concert A
// dur   — how long the tone lasts in seconds
// type  — waveform shape: "sine" is smooth, "square" is buzzy, "sawtooth" is harsh
// gain  — peak loudness on a 0-to-1 scale
// start — how many seconds from now to begin playing (defaults to immediately)
function playTone(
  ctx: AudioContext,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  start = 0,
) {
  const osc = ctx.createOscillator(); // the wave generator
  const g   = ctx.createGain();       // the volume controller

  osc.connect(g);
  g.connect(ctx.destination); // route audio to speakers

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  // fade to near-zero by the end so the tone does not click when it cuts off
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);

  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur);
}

// Plays a different sound pattern depending on how serious the risk level is.
// Extreme uses a rapid siren-like alternating tone, High uses two sharp blasts,
// Moderate uses a gentle two-note chime, and Low uses a single soft ping.
// This makes it possible to tell the severity just by listening.
function playRiskSound(risk: string) {
  const ctx = createAudioCtx();
  if (!ctx) return; // nothing to do if audio is not supported

  // browsers often suspend the audio context until the user interacts with the page
  if (ctx.state === "suspended") ctx.resume();

  if (risk === "Extreme") {
    // six rapid alternating bursts between 1400 Hz and 900 Hz — sounds like a siren
    [0, 0.22, 0.44, 0.66, 0.88, 1.1].forEach((t, i) =>
      playTone(ctx, i % 2 === 0 ? 1400 : 900, 0.18, "square", 0.75, t),
    );
  } else if (risk === "High") {
    // two sawtooth blasts that step up in pitch — urgent but not as frantic as Extreme
    playTone(ctx, 520, 0.3, "sawtooth", 0.6, 0);
    playTone(ctx, 780, 0.4, "sawtooth", 0.7, 0.4);
  } else if (risk === "Moderate") {
    // a soft two-note chime that says "pay attention" without being alarming
    playTone(ctx, 440, 0.25, "sine", 0.45, 0);
    playTone(ctx, 550, 0.35, "sine", 0.45, 0.3);
  } else {
    // a single quiet sine ping for Low risk or general confirmation sounds
    playTone(ctx, 660, 0.4, "sine", 0.3, 0);
  }
}

// Renders the stack of toast notifications that float in the top-right corner.
// Each toast has an icon, a message, and an X button to dismiss it early.
// They disappear on their own after 4.5 seconds even without clicking X.
function ToastList({
  toasts,
  remove,
}: {
  toasts: Toast[];
  remove: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 70,
        right: 16,
        zIndex: 999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            minWidth: 240,
            display: "flex",
            alignItems: "center",
            gap: 10,
            // each toast type gets its own tinted background so the user can tell
            // success (green), error (red), and info (amber) apart at a glance
            background:
              t.type === "success"
                ? "rgba(157,200,141,0.18)"
                : t.type === "error"
                  ? "rgba(255,77,77,0.18)"
                  : "rgba(241,178,74,0.18)",
            border: `1px solid ${
              t.type === "success"
                ? "rgba(157,200,141,0.4)"
                : t.type === "error"
                  ? "rgba(255,77,77,0.4)"
                  : "rgba(241,178,74,0.4)"
            }`,
            backdropFilter: "blur(14px)",
            color: "#fff",
            fontSize: 13,
          }}
        >
          {t.type === "success" ? (
            <CheckCircle size={15} color="#9DC88D" />
          ) : t.type === "error" ? (
            <AlertTriangle size={15} color="#ff4d4d" />
          ) : (
            <Bell size={15} color="#F1B24A" />
          )}

          <span style={{ flex: 1, fontSize: 12 }}>{t.msg}</span>

          <button
            onClick={() => remove(t.id)}
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Alerts() {
  const [history, setHistory]     = useState<AlertLog[]>([]); // the last 50 alert records fetched from the database
  const [preds, setPreds]         = useState<Prediction[]>([]); // the 7-day ML risk forecast from the backend
  const [loading, setLoading]     = useState(true); // stays true while the first data load is in progress so we show a spinner
  const [collapsed, setCollapsed] = useState(false); // whether the sidebar is collapsed into icon-only mode on desktop
  const [mobileOpen, setMobileOpen]   = useState(false); // whether the sidebar drawer is open on mobile
  const [lastRefresh, setLastRefresh] = useState(""); // clock time of the last successful refresh, shown in the header subtitle
  const [soundEnabled, setSoundEnabled] = useState(true); // whether the user has enabled alert sounds
  const [toasts, setToasts]   = useState<Toast[]>([]); // the list of toasts currently visible on screen
  const [sending, setSending] = useState<string | null>(null); // which send action is running right now — null means idle
  const [expandedLog, setExpandedLog] = useState<number | null>(null); // index of the history row that is expanded, null means all collapsed
  const [adminKeyLocal, setAdminKeyLocal] = useState(getAdminKey()); // local copy of the admin key loaded from sessionStorage on mount
  const [showAdminLogin, setShowAdminLogin] = useState(false); // controls whether the admin login modal is visible

  const toastId = useRef(0); // counter we increment each time we create a toast to give it a unique ID
  const isMobile = useIsMobile(); // true when the viewport is narrow enough to be considered mobile
  const admin = adminKeyLocal.length > 0; // shorthand so we do not have to check adminKeyLocal.length everywhere

  // called when the user submits valid credentials in the admin login modal —
  // saves the key to sessionStorage and updates local state so the badge appears
  const handleAdminLogin = (key: string) => {
    setAdminKey(key);
    setAdminKeyLocal(key);
    setShowAdminLogin(false);
  };

  // called when the user clicks the Admin badge to log out —
  // wipes the key from both sessionStorage and local state
  const handleAdminLogout = () => {
    clearAdminKey();
    setAdminKeyLocal("");
  };

  // pushes a new toast onto the visible stack and schedules its automatic removal —
  // the ID counter ensures even rapid-fire toasts get unique keys
  const addToast = useCallback(
    (msg: string, type: Toast["type"] = "info") => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev, { id, msg, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4500,
      );
    },
    [],
  );

  // loads both the alert history and the 7-day prediction at the same time
  // to avoid two sequential loading delays, then records the refresh time
  const fetchData = useCallback(async () => {
    try {
      const [histRes, predRes] = await Promise.all([
        api.alerts.history(50),  // grab the 50 most recent alert records
        api.ml.predictions(7),   // grab the next 7 days of fire-risk predictions
      ]);
      setHistory(histRes.data || []);
      setPreds(predRes.data || []);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      addToast("Failed to fetch — check backend", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // fetch data once when the page first loads
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // sends an alert email to subscribers for any forecast day at or above minRisk —
  // opens the login modal if no admin key is present, then refreshes history on success
  const sendAlert = async (minRisk: "High" | "Extreme", label: string) => {
    if (!admin) { setShowAdminLogin(true); return; }
    setSending(label);
    try {
      const data = await api.alerts.runEmail(minRisk);
      if (data.sent) {
        addToast(`Alert sent — ${data.alerts} day(s)`, "success");
        if (soundEnabled) playRiskSound(minRisk);
        await fetchData();
      } else {
        // the backend responded fine but found no days that qualify
        addToast(`${data.message}`, "info");
      }
    } catch {
      addToast(`Failed to send ${label} alert`, "error");
    } finally {
      setSending(null);
    }
  };

  // sends a single test email to verify SMTP delivery is working —
  // no admin login required because it does not touch real subscriber data
  const sendTestEmail = async () => {
    setSending("test");
    try {
      const data = await api.alerts.testEmail();
      if (data.ok) {
        addToast("Test email sent!", "success");
        if (soundEnabled) playRiskSound("Low");
        await fetchData();
      } else {
        throw new Error(data.message ?? "Test failed");
      }
    } catch {
      addToast("Test email failed", "error");
    } finally {
      setSending(null);
    }
  };

  // sends a fake Extreme-risk email so you can preview exactly what subscribers
  // receive without waiting for a real Extreme day to happen —
  // admin login required because it uses the same pipeline as real alerts
  const sendTestExtreme = async () => {
    if (!admin) { setShowAdminLogin(true); return; }
    setSending("test-extreme");
    try {
      const data = await api.alerts.testExtreme();
      if (data.ok) {
        addToast("Test EXTREME alert sent!", "success");
        if (soundEnabled) playRiskSound("Extreme");
        await fetchData();
      } else {
        throw new Error(data.message ?? "Test failed");
      }
    } catch {
      addToast("Test extreme failed", "error");
    } finally {
      setSending(null);
    }
  };

  // sends the daily summary report covering all 7 forecast days regardless of risk tier —
  // this is the scheduled morning email but admins can also fire it manually here
  const sendDailyReport = async () => {
    if (!admin) { setShowAdminLogin(true); return; }
    setSending("daily");
    try {
      const data = await api.alerts.dailyReport();
      if (data.ok && data.sent) {
        addToast(`Daily report sent — ${data.riskLevel}`, "success");
        if (soundEnabled) playRiskSound(data.riskLevel ?? "Low");
        await fetchData();
      } else {
        addToast(data.message ?? "No predictions available", "info");
      }
    } catch {
      addToast("Daily report failed", "error");
    } finally {
      setSending(null);
    }
  };

  // find the worst day in the forecast to feature in the top banner —
  // we prefer Extreme over High, and if neither exists we skip the banner entirely
  const worstPred =
    preds.find((p) => p.risk_label === "Extreme") ??
    preds.find((p) => p.risk_label === "High");

  // these counts feed the stat cards so users can see at a glance how many
  // dangerous days are coming up in the next week
  const extremeDays = preds.filter((p) => p.risk_label === "Extreme").length;
  const highDays    = preds.filter((p) => p.risk_label === "High").length;

  // slice to just the date portion of the ISO string so we can count today's alerts
  // without worrying about time zone offsets
  const todayUTC    = new Date().toISOString().slice(0, 10);
  const alertsToday = history.filter((h) => h.created_at?.slice(0, 10) === todayUTC).length;

  // returns a consistent glass-card style used for every panel on the page —
  // pass extra overrides if you need to tweak padding or border on a specific card
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.09)",
    borderRadius: 20,
    padding: "18px 20px",
    ...extra,
  });

  // returns the style for a pill-shaped action button tinted to the given color —
  // when disabled is true the button dims and shows a not-allowed cursor
  const btn = (color: string, disabled = false): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 16px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    background: disabled ? `${color}08` : `${color}18`,
    border: `1px solid ${color}35`,
    color: disabled ? `${color}60` : color,
    fontWeight: 700,
    fontSize: 13,
    cursor: disabled ? "not-allowed" : "pointer",
  });

  // while the first fetch is in progress, show a centred spinner —
  // the sidebar is still rendered on desktop so the layout does not jump when data arrives
  if (loading) {
    return (
      <div style={{ display: "flex", minHeight: "100vh" }}>
        {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(157,200,141,0.2)", borderTopColor: "#9DC88D", animation: "spin 0.9s linear infinite" }} />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Loading alerts...</div>
        </div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "transparent" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <ToastList toasts={toasts} remove={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* sticky header with page title, location subtitle, sound toggle, admin badge, and refresh */}
        <header style={{ padding: isMobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.07)", background: "rgba(8,22,18,0.6)", backdropFilter: "blur(14px)", position: "sticky", top: 0, zIndex: 10, gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* on mobile the sidebar is hidden by default so we need a hamburger button */}
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
                <Menu size={22} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, color: "#fff", margin: 0 }}>Alert Center</h1>
              {/* small subtitle showing the active location and when we last pulled fresh data */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={10} /> Lumbini &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading..."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* mutes or unmutes alert sounds — the icon flips to reflect the current state */}
            <button onClick={() => setSoundEnabled((s) => !s)} style={{ ...btn(soundEnabled ? "#9DC88D" : "#888"), padding: "8px 12px" }}>
              {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
              {!isMobile && (soundEnabled ? " Sound On" : " Sound Off")}
            </button>

            {/* if a key is stored we show an Admin badge the user can click to log out,
                otherwise we show a Login button that opens the auth modal */}
            {adminKeyLocal ? (
              <div onClick={handleAdminLogout} title="Click to logout" style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(241,178,74,0.12)", border: "1px solid rgba(241,178,74,0.3)", color: "#F1B24A", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Admin
              </div>
            ) : (
              <button onClick={() => setShowAdminLogin(true)} style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer" }}>
                Login
              </button>
            )}

            <button onClick={fetchData} style={{ ...btn("#9DC88D"), padding: "8px 12px" }}>
              <RefreshCw size={13} />{!isMobile && " Refresh"}
            </button>
          </div>
        </header>

        <div style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 22, overflowY: "auto" }}>

          {/* top banner — only shown when at least one High or Extreme day is forecast,
              gives a one-click shortcut to send that alert immediately */}
          {worstPred && (
            <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderRadius: 18, background: RISK_BG[worstPred.risk_label], border: `2px solid ${RISK_COLOR[worstPred.risk_label]}50`, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: 16, background: `${RISK_COLOR[worstPred.risk_label]}20`, border: `1px solid ${RISK_COLOR[worstPred.risk_label]}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Flame size={isMobile ? 20 : 26} color={RISK_COLOR[worstPred.risk_label]} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 900, color: RISK_COLOR[worstPred.risk_label] }}>
                    {RISK_ICON[worstPred.risk_label]} {worstPred.risk_label} Risk Detected
                  </div>
                  {/* shows which date the worst risk falls on and how confident the model is */}
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>
                    {worstPred.date} · {Math.round(worstPred.risk_probability * 100)}% confidence
                  </div>
                </div>
              </div>
              <button onClick={() => sendAlert(worstPred.risk_label === "Extreme" ? "Extreme" : "High", worstPred.risk_label)} disabled={!!sending} style={{ ...btn(RISK_COLOR[worstPred.risk_label], !!sending), padding: "10px 18px", fontSize: 13 }}>
                <BellRing size={14} />
                {sending ? "Sending..." : `Send ${worstPred.risk_label} Alert`}
              </button>
            </div>
          )}

          {/* four stat cards: total alerts all time, alerts today, Extreme days, High days */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: isMobile ? 10 : 14 }}>
            {[
              { label: "Total Alerts", val: history.length,  color: "#60a5fa", icon: <Bell size={18} /> },
              { label: "Today",        val: alertsToday,      color: "#F1B24A", icon: <Clock size={18} /> },
              { label: "Extreme Days", val: extremeDays,      color: "#ff4d4d", icon: <Flame size={18} /> },
              { label: "High Days",    val: highDays,         color: "#ff8c42", icon: <AlertTriangle size={18} /> },
            ].map((s) => (
              <div key={s.label} style={{ ...card(), padding: "16px 14px" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: `${s.color}18`, border: `1px solid ${s.color}28`, display: "flex", alignItems: "center", justifyContent: "center", color: s.color, marginBottom: 10 }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* two-column layout: send actions on the left, info panels on the right —
              on mobile these stack into a single column */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 14 : 18 }}>

            {/* left panel — all the buttons for sending alert emails */}
            <div style={card()}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 16 }}>Send Alert Notifications</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                {/* the three main alert types — High risk, Extreme only, and the daily report */}
                {[
                  { color: "#ff8c42", title: "High Risk Alert",   desc: "Emails when High or Extreme detected",  key: "High",    action: () => sendAlert("High", "High") },
                  { color: "#ff4d4d", title: "Extreme Risk Only", desc: "Emails only when Extreme days exist",   key: "Extreme", action: () => sendAlert("Extreme", "Extreme") },
                  { color: "#60a5fa", title: "Daily Report",      desc: "Full 7-day report for all risk levels", key: "daily",   action: sendDailyReport },
                ].map((item) => (
                  <div key={item.key} style={{ padding: "14px 16px", borderRadius: 14, background: `${item.color}08`, border: `1px solid ${item.color}22`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{item.desc}</div>
                    </div>
                    <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                      <Send size={12} />{sending === item.key ? "Sending..." : "Send"}
                    </button>
                  </div>
                ))}

                {/* diagnostic section — these do not send real alerts to subscribers */}
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12 }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>Testing & Diagnostics</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { color: "#9DC88D", title: "SMTP Smoke Test",    key: "test",         action: sendTestEmail,   icon: <Mail size={12} /> },
                      { color: "#ff4d4d", title: "Fake Extreme Alert", key: "test-extreme", action: sendTestExtreme, icon: <Zap  size={12} /> },
                    ].map((item) => (
                      <div key={item.key} style={{ padding: "12px 14px", borderRadius: 12, background: `${item.color}07`, border: `1px solid ${item.color}20`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.title}</div>
                        <button onClick={item.action} disabled={!!sending} style={btn(item.color, !!sending)}>
                          {item.icon}{sending === item.key ? "Running..." : "Run"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* right column — sound preview, email config, and the mini 7-day forecast */}
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 18 }}>

              {/* sound preview panel — lets the user hear each risk tier before a real alert fires */}
              <div style={card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Sound Preview</div>
                  {/* compact toggle that mirrors the one in the header */}
                  <button onClick={() => setSoundEnabled((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, background: soundEnabled ? "rgba(157,200,141,0.12)" : "rgba(100,100,100,0.12)", border: `1px solid ${soundEnabled ? "rgba(157,200,141,0.3)" : "rgba(100,100,100,0.3)"}`, color: soundEnabled ? "#9DC88D" : "#888", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />} {soundEnabled ? "On" : "Off"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr", gap: 8 }}>
                  {["Extreme", "High", "Moderate", "Low"].map((risk) => (
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

              {/* email config panel — shows SMTP host, auto-alert threshold, and report schedule
                  so admins can confirm the setup is correct at a glance */}
              <div style={card()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Email Config</div>
                {[
                  { label: "SMTP",       val: "smtp.gmail.com",    color: "#9DC88D", icon: <Shield   size={12} /> },
                  { label: "Auto Alert", val: "High & Extreme",    color: "#ff8c42", icon: <BellRing size={12} /> },
                  { label: "Report",     val: "Daily at 10:35 AM", color: "#60a5fa", icon: <Clock    size={12} /> },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ color: item.color }}>{item.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.38)" }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.val}</div>
                    </div>
                  </div>
                ))}
                {/* reminder to run the smoke test on a fresh deployment */}
                <div style={{ marginTop: 10, padding: "9px 12px", borderRadius: 10, background: "rgba(157,200,141,0.07)", border: "1px solid rgba(157,200,141,0.2)", fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 7 }}>
                  <CheckCircle size={12} color="#9DC88D" /> Run SMTP Test to verify delivery.
                </div>
              </div>

              {/* compact 7-day forecast — one row per day with a probability bar and risk label —
                  only rendered when predictions actually exist */}
              {preds.length > 0 && (
                <div style={card()}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>7-Day Risk</div>
                  {preds.slice(0, 7).map((p, i) => {
                    const col = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                    const pct = Math.round(p.risk_probability * 100); // convert 0-1 probability to a percentage for the bar width
                    const day = new Date(p.date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", width: 70, flexShrink: 0 }}>{day}</div>
                        {/* thin bar where the coloured fill equals the risk probability */}
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 999, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 999 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: col, width: 60, textAlign: "right", flexShrink: 0 }}>
                          {RISK_ICON[p.risk_label]} {p.risk_label}
                        </span>
                      </div>
                    );
                  })}
                  <Link to="/forecast" style={{ display: "block", marginTop: 10, textAlign: "center", fontSize: 12, color: "#F1B24A", fontWeight: 700, padding: 7, borderRadius: 10, background: "rgba(241,178,74,0.08)", border: "1px solid rgba(241,178,74,0.2)" }}>
                    Full Forecast
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* alert history list — every email that has been sent appears here —
              clicking a row expands it to show the full metadata */}
          <div style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.8 }}>Alert History</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {history.length} record{history.length !== 1 ? "s" : ""}
              </span>
            </div>

            {history.length === 0 ? (
              // empty state shown when no alerts have been sent yet
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
                  const expanded = expandedLog === i; // true when the user has clicked this row open

                  return (
                    <div key={i} style={{ borderRadius: 14, background: "rgba(255,255,255,0.03)", border: `1px solid ${expanded ? col + "35" : "rgba(255,255,255,0.07)"}`, overflow: "hidden" }}>

                      {/* collapsed row — shows risk badge, message preview, and date —
                          clicking anywhere on this bar toggles the detail grid open or closed */}
                      <div style={{ padding: isMobile ? "12px 14px" : "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setExpandedLog(expanded ? null : i)}>
                        <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30`, flexShrink: 0 }}>
                          {RISK_ICON[row.risk_label]}
                          {/* on mobile we only show the icon to save horizontal space */}
                          {!isMobile && row.risk_label}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.message}</div>
                          {/* mobile is too narrow for the location key so we show the date instead */}
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{isMobile ? row.alert_date : row.location_key}</div>
                        </div>

                        {/* date and time tucked on the right edge — desktop only */}
                        {!isMobile && (
                          <div style={{ textAlign: "right", flexShrink: 0, marginRight: 8 }}>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{row.alert_date}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                              {new Date(row.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        )}

                        {/* arrow that flips upward when the row is open */}
                        <div style={{ color: "rgba(255,255,255,0.3)", flexShrink: 0 }}>
                          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </div>
                      </div>

                      {/* detail grid — only mounted when this specific row is expanded —
                          shows every field from the AlertLog record in small labelled tiles */}
                      {expanded && (
                        <div style={{ padding: isMobile ? "0 14px 14px" : "0 18px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                          <div style={{ paddingTop: 12, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3,1fr)", gap: 8 }}>
                            {[
                              { label: "Alert ID",   val: `#${row.id}` },
                              { label: "Location",   val: row.location_key },
                              { label: "Alert Date", val: row.alert_date },
                              { label: "Risk Level", val: row.risk_label },
                              { label: "Sent At",    val: new Date(row.created_at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) },
                            ].map((f) => (
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

      {/* admin login modal — appears as a centred overlay when an admin-only action is triggered
          without a key loaded — the backdrop blurs the page behind it */}
      {showAdminLogin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "rgba(8,22,18,0.98)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Admin Login</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginBottom: 20 }}>Required to send alert emails</div>
            <AdminLogin onLogin={handleAdminLogin} onCancel={() => setShowAdminLogin(false)} />
          </div>
        </div>
      )}

      {/* CSS keyframe for the loading spinner — defined once here at the bottom */}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}