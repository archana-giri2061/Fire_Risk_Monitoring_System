// This file powers the 7-Day Forecast page. It shows each day's predicted fire risk,
// lets admins run the ML model on demand, trigger alert emails, and review alert history.

import { useEffect, useState } from "react";
import {
  CalendarDays, AlertTriangle, CheckCircle, RefreshCw,
  MapPin, Clock, Bell, ChevronDown, ChevronUp, Flame,
} from "lucide-react";
import { Sidebar } from "../components/Sidebar";
import AdminLogin from "../components/AdminLogin";
import { useIsMobile } from "../hooks/useIsMobile";
import { RISK_COLOR, RISK_BG, RISK_ICON } from "../utils/risk";
import { api, isAdmin, setAdminKey, getAdminKey, clearAdminKey } from "../api";

// One day's worth of ML prediction data returned by the backend
interface Prediction {
  date: string;             // the calendar date this prediction covers, formatted as YYYY-MM-DD
  risk_code: number;        // numeric risk tier used internally by the ML model (0–3)
  risk_label: string;       // human-readable tier name: Low, Moderate, High, or Extreme
  risk_probability: number; // the model's confidence for this tier as a decimal between 0 and 1
  model_name: string;       // which model produced this prediction, e.g. "XGBoost"
}

// One row from the alert history table — created each time an email is dispatched
interface AlertLog {
  id: number;           // auto-incremented database ID
  location_key: string; // slug identifying the location, e.g. "lumbini_np"
  risk_label: string;   // the risk tier that triggered this alert
  alert_date: string;   // the forecast date the alert was about, formatted as YYYY-MM-DD
  message: string;      // short summary line that appeared in the email body
  created_at: string;   // full ISO timestamp of when this record was saved
}

// Thin horizontal bar that fills proportionally to represent a probability value.
// The fill transitions smoothly when the value changes so it feels animated on load.
function RiskBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${Math.min(100, Math.round(pct * 100))}%`, // cap at 100% to guard against floating-point overshoot
        background: color,
        borderRadius: 999,
        transition: "width 1s ease", // smooth fill animation when the component first renders
      }} />
    </div>
  );
}

export default function Forecast() {
  const [preds, setPreds]           = useState<Prediction[]>([]); // the 7-day forecast from the ML backend
  const [history, setHistory]       = useState<AlertLog[]>([]);   // the 20 most recent alert history records
  const [loading, setLoading]       = useState(true);             // true while the initial data fetch is in progress
  const [running, setRunning]       = useState(false);            // true while a prediction or alert is being sent
  const [msg, setMsg]               = useState("");               // status message shown below the header after an action
  const [collapsed, setCollapsed]   = useState(false);            // whether the sidebar is collapsed on desktop
  const [mobileOpen, setMobileOpen] = useState(false);            // whether the sidebar drawer is open on mobile
  const [expanded, setExpanded]     = useState<number | null>(0); // index of the expanded forecast row (first row open by default)
  const [lastRefresh, setLastRefresh] = useState("");             // clock time of the last successful data refresh
  const [adminKey, setAdminKeyState]  = useState(getAdminKey());  // local copy of the admin key from sessionStorage
  const [showAdmin, setShowAdmin]     = useState(false);          // controls whether the admin login modal is visible

  const isMobile = useIsMobile(); // true when the viewport is below the mobile breakpoint

  // saves the submitted admin key to sessionStorage and updates local state so the badge appears
  const handleAdminLogin = (key: string) => {
    setAdminKey(key);
    setAdminKeyState(key);
    setShowAdmin(false);
  };

  // wipes the admin key from both sessionStorage and local state when the user logs out
  const handleAdminLogout = () => {
    clearAdminKey();
    setAdminKeyState("");
  };

  // fetches the 7-day forecast and the last 20 alert records at the same time to avoid
  // two sequential loading delays, then stamps the refresh time in the header
  const fetchData = async () => {
    try {
      const [pr, hr] = await Promise.all([
        api.ml.predictions(7),      // grab 7 days of risk predictions
        api.alerts.history(20),     // grab the 20 most recent alert log entries
      ]);
      setPreds(pr.data || []);
      setHistory(hr.data || []);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      // silently swallow the error — the stale data stays on screen
    } finally {
      setLoading(false);
    }
  };

  // asks the backend to run the ML model and regenerate the 7-day forecast —
  // shows a status message and refreshes the displayed data when it finishes
  const runPrediction = async () => {
    setRunning(true);
    setMsg("Running ML prediction...");
    try {
      const d = await api.ml.predictForecast();
      setMsg(d.ok ? "Prediction complete! Forecast updated." : `${d.message ?? "Failed"}`);
      await fetchData();
    } catch {
      setMsg("Failed to run prediction");
    } finally {
      setRunning(false);
    }
  };

  // sends alert emails for any forecast day at High risk or above —
  // shows how many days qualified or a message if none were found
  const triggerAlert = async () => {
    setRunning(true);
    setMsg("");
    try {
      const d = await api.alerts.runEmail("High");
      setMsg(d.sent ? `Alert sent — ${d.alerts} high-risk day(s)` : `${d.message}`);
      await fetchData();
    } catch {
      setMsg("Failed to send alert");
    } finally {
      setRunning(false);
    }
  };

  // fetch data once when the page first mounts
  useEffect(() => {
    fetchData();
  }, []);

  // find the most dangerous day to highlight in the top banner —
  // prefer Extreme over High, skip the banner entirely if neither exists
  const worst     = preds.find(p => p.risk_label === "Extreme") || preds.find(p => p.risk_label === "High");

  // total count of High and Extreme days shown in the banner subtitle
  const highCount = preds.filter(p => ["High", "Extreme"].includes(p.risk_label)).length;

  // show a centred spinner while the first fetch is running
  if (loading) return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {!isMobile && <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div className="spinner" />
        <div style={{ color: "rgba(255,255,255,.5)", fontSize: 14 }}>Loading forecast...</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* sticky top bar with page title, location, refresh, admin toggle, and action buttons */}
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* on mobile we need a button to open the hidden sidebar drawer */}
            {isMobile && (
              <button onClick={() => setMobileOpen(true)} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
                <CalendarDays size={22} />
              </button>
            )}
            <div>
              <h1 style={{ fontSize: isMobile ? 16 : 20, fontWeight: 800, margin: 0 }}>7-Day Forecast</h1>
              {/* subtitle showing the monitored location and when we last pulled fresh data */}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                <MapPin size={10} /> Lumbini &nbsp;·&nbsp; <Clock size={10} /> {lastRefresh || "Loading..."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-green" onClick={fetchData}>
              <RefreshCw size={12} />{!isMobile && " Refresh"}
            </button>

            {/* shows an Admin badge when logged in (click to log out), or a Login button otherwise */}
            {adminKey
              ? <div className="admin-badge" onClick={handleAdminLogout} title="Click to logout">Admin</div>
              : <button className="btn btn-ghost" onClick={() => setShowAdmin(true)}>Login</button>
            }

            {/* runs the ML model to regenerate the forecast — requires admin login */}
            <button className="btn btn-amber" onClick={() => { if (!isAdmin()) { setShowAdmin(true); return; } runPrediction(); }} disabled={running}>
              {running ? "Running..." : isMobile ? "Run" : "Run Prediction"}
            </button>

            {/* sends alert emails for High and Extreme days — requires admin login */}
            <button className="btn btn-orange" onClick={() => { if (!isAdmin()) { setShowAdmin(true); return; } triggerAlert(); }} disabled={running}>
              <Bell size={12} />{!isMobile && " Alert"}
            </button>
          </div>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: isMobile ? 14 : 20, overflowY: "auto" }}>

          {/* status message shown after running a prediction or sending an alert —
              background color changes based on whether the action succeeded or failed */}
          {msg && (
            <div style={{
              padding: "12px 16px",
              borderRadius: 14,
              fontSize: 13,
              color: "#fff",
              background: msg.startsWith("Prediction complete") || msg.startsWith("Alert sent")
                ? "rgba(157,200,141,.12)"
                : msg.startsWith("Failed")
                  ? "rgba(255,77,77,.12)"
                  : "rgba(241,178,74,.12)",
              border: `1px solid ${
                msg.startsWith("Prediction complete") || msg.startsWith("Alert sent")
                  ? "rgba(157,200,141,.3)"
                  : msg.startsWith("Failed")
                    ? "rgba(255,77,77,.3)"
                    : "rgba(241,178,74,.3)"
              }`,
            }}>
              {msg}
            </div>
          )}

          {/* top banner highlighting the worst forecast day —
              only shown when at least one High or Extreme day exists */}
          {worst && (
            <div style={{ padding: isMobile ? "14px 16px" : "18px 24px", borderRadius: 18, background: RISK_BG[worst.risk_label], border: `1px solid ${RISK_COLOR[worst.risk_label]}40`, display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${RISK_COLOR[worst.risk_label]}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Flame size={22} color={RISK_COLOR[worst.risk_label]} />
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, color: RISK_COLOR[worst.risk_label] }}>
                    {RISK_ICON[worst.risk_label]} {worst.risk_label} Risk Detected
                  </div>
                  {/* subtitle tells the user how many dangerous days are in the upcoming week */}
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,.55)", marginTop: 3 }}>
                    {highCount} high-risk day{highCount !== 1 ? "s" : ""} in forecast
                  </div>
                </div>
              </div>

              {/* mini count of how many days fall into each risk tier */}
              <div style={{ display: "flex", gap: 16 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => (
                  <div key={lbl} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: RISK_COLOR[lbl] }}>
                      {preds.filter(p => p.risk_label === lbl).length}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)" }}>{lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* empty state shown when no predictions have been generated yet */}
          {preds.length === 0 ? (
            <div className="card" style={{ padding: "48px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🌿</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>No forecast data yet</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginBottom: 16 }}>
                Run the ML prediction to generate a 7-day fire risk forecast
              </div>
              <button
                className="btn btn-amber"
                onClick={() => { if (!isAdmin()) { setShowAdmin(true); return; } runPrediction(); }}
                disabled={running}
                style={{ margin: "0 auto", padding: "10px 24px", fontSize: 14 }}
              >
                {running ? "Running..." : "Run Prediction Now"}
              </button>
            </div>
          ) : (
            // daily forecast list — one collapsible card per day
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="label-caps" style={{ marginBottom: 4 }}>Daily Breakdown</div>

              {preds.slice(0, 7).map((p, i) => {
                const col    = RISK_COLOR[p.risk_label] ?? "#9DC88D";
                const pct    = Math.round(p.risk_probability * 100); // probability as a whole-number percentage
                const isOpen = expanded === i; // true when this specific row is expanded

                return (
                  <div key={i} style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${isOpen ? col + "40" : "rgba(255,255,255,.09)"}`, borderRadius: 18, overflow: "hidden" }}>

                    {/* collapsed row header — clicking anywhere here toggles the detail section */}
                    <div
                      style={{ padding: isMobile ? "14px 16px" : "18px 22px", display: "flex", alignItems: "center", gap: isMobile ? 12 : 16, cursor: "pointer" }}
                      onClick={() => setExpanded(isOpen ? null : i)}
                    >
                      {/* risk tier icon in a tinted square */}
                      <div style={{ width: isMobile ? 38 : 46, height: isMobile ? 38 : 46, borderRadius: 14, background: `${col}18`, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: isMobile ? 18 : 22 }}>
                        {RISK_ICON[p.risk_label]}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800 }}>
                            {new Date(p.date).toLocaleDateString("en", { weekday: "long" })}
                          </div>
                          {/* "TODAY" badge only appears on the first row */}
                          {i === 0 && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(157,200,141,.2)", color: "#9DC88D", border: "1px solid rgba(157,200,141,.35)" }}>
                              TODAY
                            </span>
                          )}
                          {/* "ALERT" badge appears on High and Extreme days to draw attention */}
                          {["High", "Extreme"].includes(p.risk_label) && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: `${col}20`, color: col, border: `1px solid ${col}40` }}>
                              ALERT
                            </span>
                          )}
                        </div>

                        {/* full date below the weekday name */}
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 2 }}>
                          {new Date(p.date).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}
                        </div>

                        {/* on mobile the risk label and probability bar sit inside the left column
                            because there is not enough horizontal space for a right-side column */}
                        {isMobile && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: col }}>{p.risk_label}</div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>{pct}%</div>
                            <div style={{ flex: 1 }}><RiskBar pct={p.risk_probability} color={col} /></div>
                          </div>
                        )}
                      </div>

                      {/* on desktop the risk label and probability bar live in a right-side column */}
                      {!isMobile && (
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: col }}>{p.risk_label}</div>
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", marginTop: 2 }}>Confidence: {pct}%</div>
                          </div>
                          <div style={{ width: 72 }}><RiskBar pct={p.risk_probability} color={col} /></div>
                        </div>
                      )}

                      {/* chevron that flips upward when the row is open */}
                      <div style={{ color: "rgba(255,255,255,.4)", flexShrink: 0 }}>
                        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </div>

                    {/* expanded detail section — only mounted when this row is open */}
                    {isOpen && (
                      <div style={{ padding: isMobile ? "0 16px 16px" : "0 22px 20px", borderTop: "1px solid rgba(255,255,255,.07)" }}>

                        {/* three info tiles: confidence, risk category, and which ML model was used */}
                        <div style={{ paddingTop: 16, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
                          {[
                            {
                              label: "Model Confidence",
                              content: (
                                <>
                                  <div style={{ fontSize: 28, fontWeight: 900, color: col }}>
                                    {pct}<span style={{ fontSize: 14 }}>%</span>
                                  </div>
                                  <div style={{ marginTop: 8 }}>
                                    <RiskBar pct={p.risk_probability} color={col} />
                                  </div>
                                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 6 }}>
                                    How sure the model is about this category
                                  </div>
                                </>
                              ),
                            },
                            {
                              label: "Risk Category",
                              content: (
                                <>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: col }}>
                                    {RISK_ICON[p.risk_label]} {p.risk_label}
                                  </div>
                                  {/* risk_code is the raw numeric class the model outputs internally */}
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                                    Code: {p.risk_code}
                                  </div>
                                </>
                              ),
                            },
                            {
                              label: "ML Model",
                              content: (
                                <>
                                  {/* fall back to "XGBoost" if the backend does not return a model name */}
                                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.model_name || "XGBoost"}</div>
                                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 4 }}>
                                    Multi-class · 6 features
                                  </div>
                                </>
                              ),
                            },
                          ].map(card => (
                            <div key={card.label} style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)" }}>
                              <div className="label-caps" style={{ marginBottom: 8 }}>{card.label}</div>
                              {card.content}
                            </div>
                          ))}
                        </div>

                        {/* action banner shown for High and Extreme days telling staff what to do */}
                        {["High", "Extreme"].includes(p.risk_label) && (
                          <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 14, background: `${col}10`, border: `1px solid ${col}25`, display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <AlertTriangle size={15} color={col} style={{ flexShrink: 0, marginTop: 1 }} />
                            <div style={{ fontSize: 13, color: "rgba(255,255,255,.7)" }}>
                              <strong style={{ color: col }}>Action Required:</strong>{" "}
                              {p.risk_label === "Extreme"
                                ? "Extreme fire danger — avoid all open burning, deploy fire watch teams, notify local authorities."
                                : "High fire danger — restrict burning activities, increase patrol frequency."}
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

          {/* horizontal stacked bar showing how many days fall into each risk tier —
              segments are proportional to their share of the 7-day window */}
          {preds.length > 0 && (
            <div className="card">
              <div className="label-caps" style={{ marginBottom: 14 }}>7-Day Risk Distribution</div>
              <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", gap: 2 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => {
                  const cnt = preds.filter(p => p.risk_label === lbl).length;
                  if (!cnt) return null; // skip tiers with zero days so there are no phantom gaps
                  const pct = (cnt / preds.length) * 100;
                  return (
                    <div key={lbl} style={{ flex: pct, background: RISK_COLOR[lbl], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#1d241e" }}>
                      {/* only print the label when the segment is wide enough to hold it */}
                      {pct > 12 ? `${cnt}d` : ""}
                    </div>
                  );
                })}
              </div>
              {/* legend below the bar */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
                {["Low", "Moderate", "High", "Extreme"].map(lbl => (
                  <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(255,255,255,.5)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: RISK_COLOR[lbl] }} />
                    {lbl}: {preds.filter(p => p.risk_label === lbl).length}d
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* alert history table showing every email that has been dispatched */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div className="label-caps">Alert History</div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>{history.length} records</span>
            </div>

            {history.length === 0 ? (
              // empty state when nothing has been sent yet
              <div style={{ textAlign: "center", padding: "28px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <CheckCircle size={24} color="#9DC88D" />
                <div style={{ fontSize: 13, fontWeight: 600, color: "#9DC88D" }}>No alert history</div>
              </div>
            ) : (
              // scrollable table so the layout stays clean on narrow screens
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
                  <thead>
                    <tr>
                      {["Date", "Location", "Risk", "Message", "Sent At"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "9px 10px", fontSize: 11, color: "rgba(255,255,255,.38)", fontWeight: 600, background: "rgba(255,255,255,.04)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r, i) => {
                      const col = RISK_COLOR[r.risk_label] ?? "#9DC88D";
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                          <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,.6)" }}>{r.alert_date}</td>
                          <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,.6)" }}>{r.location_key}</td>
                          <td style={{ padding: "10px" }}>
                            {/* risk level shown as a coloured pill badge */}
                            <span style={{ padding: "3px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${col}18`, color: col, border: `1px solid ${col}30` }}>
                              {r.risk_label}
                            </span>
                          </td>
                          <td style={{ padding: "10px", fontSize: 12, color: "rgba(255,255,255,.5)", maxWidth: 200 }}>{r.message}</td>
                          <td style={{ padding: "10px", fontSize: 11, color: "rgba(255,255,255,.35)", whiteSpace: "nowrap" }}>
                            {new Date(r.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* admin login modal — centred overlay that appears when an admin-only action is triggered
          without a key loaded — the backdrop blurs the page content behind it */}
      {showAdmin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "rgba(8,22,18,.98)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 380 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Admin Login</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)", marginBottom: 20 }}>
              Required to run predictions and send alerts
            </div>
            <AdminLogin onLogin={handleAdminLogin} onCancel={() => setShowAdmin(false)} />
          </div>
        </div>
      )}
    </div>
  );
}